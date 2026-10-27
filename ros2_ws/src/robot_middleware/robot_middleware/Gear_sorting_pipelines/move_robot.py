#!/usr/bin/env python3
import time
import math
from trajectory_msgs.msg import JointTrajectory, JointTrajectoryPoint
from sensor_msgs.msg import JointState
from std_msgs.msg import String
from my_robot_interfaces.msg import RobotCommand
import rclpy

class RobotMover:

    # joint_basis_arm1 limits from URDF: lower=-6.17847, upper=0.0
    J0_LOWER = -6.17847
    J0_UPPER = 0.0

    def __init__(self, node):
        """
        node = ROS2 node (InspectionNode)
        """
        self.node = node

        self.traj_pub = node.create_publisher(
            JointTrajectory, '/planned_trajectory', 10)
        self.publisher_ = node.create_publisher(RobotCommand, '/robot_cmd', 10)
        self.cmd_pub = node.create_publisher(
            String, '/stm32_cmd', 10)
        self.gripper_state = "unknown"
        node.create_subscription(
            String, '/gripper_status', self._gripper_status_cb, 10
        )
        self.joint_names = [
            'joint_basis_arm1',
            'joint_arm1_arm2',
            'joint_arm2_arm3',
            'joint_arm3_greifer'
        ]

        self.current_positions = [0.0, 0.0, 0.0, 0.0]

        node.create_subscription(
            JointState,
            '/joint_states',
            self._joint_state_cb,
            10
        )

        self._wait_for_connection()

        # ── NEW: async state-machine bookkeeping (does not affect old methods) ──
        self._async_target = None
        self._async_gripper_after = None   # "grip_open" / "grip_close" / None
        self._async_phase = "idle"         # "idle" | "moving" | "gripping" | "done"
        self._async_tolerance = 0.03

    # ─────────────────────────────────────────────
    @staticmethod
    def wrap_to_joint_range(angle, lower, upper):
        """Wrap angle by 2π steps until it falls within [lower, upper]."""
        while angle > upper:
            angle -= 2 * math.pi
        while angle < lower:
            angle += 2 * math.pi
        return angle

    def _wrap_j0(self, angle):
        return self.wrap_to_joint_range(angle, self.J0_LOWER, self.J0_UPPER)

    # ─────────────────────────────────────────────
    # Connection check (NO SPIN)
    # ─────────────────────────────────────────────
    def _wait_for_connection(self):
        self.node.get_logger().info("Waiting for subscribers...")

        start = time.time()
        while True:
            traj_ready = self.traj_pub.get_subscription_count() > 0
            cmd_ready  = self.cmd_pub.get_subscription_count() > 0

            if traj_ready and cmd_ready:
                self.node.get_logger().info("Publishers connected.")
                return

            if time.time() - start > 10.0:
                self.node.get_logger().warn("Timeout waiting for subscribers")
                return

            time.sleep(0.1)

    # ─────────────────────────────────────────────
    def _joint_state_cb(self, msg: JointState):
        pos_map = dict(zip(msg.name, msg.position))
        self.current_positions = [
            pos_map.get(n, 0.0) for n in self.joint_names
        ]

    def _gripper_status_cb(self, msg: String):
        self.gripper_state = msg.data

    # ─────────────────────────────────────────────
    def wait_for_motion(self, duration=3.5):
        self.node.get_logger().info(
            f"Waiting {duration}s for motion to complete..."
        )
        time.sleep(duration)

    # ─────────────────────────────────────────────
    def send_trajectory(self, waypoints: list, duration_sec=2):

        points = []

        p0 = JointTrajectoryPoint()
        p0.positions = list(self.current_positions)
        p0.time_from_start.sec = 0
        points.append(p0)

        for i, pos in enumerate(waypoints):
            p = JointTrajectoryPoint()
            p.positions = pos
            p.time_from_start.sec = duration_sec * (i + 1)
            points.append(p)

        traj = JointTrajectory()
        traj.joint_names = self.joint_names
        traj.points = points

        self.traj_pub.publish(traj)

        self.node.get_logger().info(
            f"Trajectory sent with {len(points)} points"
        )

    def send_move(self, x, y, z):
        msg = RobotCommand()
        msg.base_id = "unity_web_client"
        msg.target_pose.position.x = float(x)
        msg.target_pose.position.y = float(y)
        msg.target_pose.position.z = float(z)
        msg.target_pose.orientation.x = 0.0
        msg.target_pose.orientation.y = 0.0
        msg.target_pose.orientation.z = 0.0
        msg.target_pose.orientation.w = 1.0
        self.node.get_logger().info(f'Sending movement command: pos=({x}, {y}, {z})')
        self.publisher_.publish(msg)

    # ─────────────────────────────────────────────
    def send_gripper(self, state: str):
        msg = String()
        msg.data = state
        self.cmd_pub.publish(msg)
        self.node.get_logger().info(f"Gripper: {state}")

    def send_gripper_and_wait(self, state: str, timeout=8.0):
        target = "closed" if state == "grip_close" else "open"
        self.send_gripper(state)
        return self.wait_for_gripper(target, timeout=timeout)

    # ─────────────────────────────────────────────
    def move_to_station(self):
        self.node.get_logger().info("Moving to INSPECTION STATION")

        target = [self._wrap_j0(3.65), -1.1, -1.3, -0.73]  # TUNED IN UNITY (j0 wrapped)
        cur = self.current_positions

        self.send_trajectory([
            [cur[0], -0.5, -0.5, cur[3]],
            [target[0], -0.5, -0.5, target[3]],
            target
        ])

        self.wait_until_reached(target)
        self.send_gripper_and_wait("grip_close")

    # ─────────────────────────────────────────────
    def move_robot_to_good_bin(self):
        self.node.get_logger().info("Moving to GOOD bin")

        target = [self._wrap_j0(-4.4), -0.9, -1.0, -1.3]  # TUNED IN UNITY (j0 wrapped)
        cur = self.current_positions

        self.send_trajectory([
            [cur[0], -0.5, -0.5, cur[3]],
            [target[0], -0.5, -0.5, target[3]],
            target
        ])

        self.wait_until_reached(target)
        self.send_gripper_and_wait("grip_open")

    # ─────────────────────────────────────────────
    def move_robot_to_reject_bin(self):
        self.node.get_logger().info("Moving to REJECT bin")

        target = [self._wrap_j0(4.95), -0.6, -1.4, -1.0]  # TUNED IN UNITY (j0 wrapped)
        cur = self.current_positions

        self.send_trajectory([
            [cur[0], -0.5, -0.5, cur[3]],
            [target[0], -0.5, -0.5, target[3]],
            target
        ])

        self.wait_until_reached(target)
        self.send_gripper_and_wait("grip_open")

    def move_robot_to_Top_View(self):
        self.node.get_logger().info("Moving to TOP VIEW")

        target = [self._wrap_j0(3.65), -1.0, -0.6, 0.3]  # TUNED IN UNITY (j0 wrapped)
        cur = self.current_positions

        self.send_trajectory([
            [cur[0], -0.5, -0.5, cur[3]],
            [target[0], -0.5, -0.5, target[3]],
            target
        ])

        self.wait_until_reached(target)

    def move_robot_to_Pick_View(self):
        self.node.get_logger().info("Moving to PICK VIEW")

        target = [self._wrap_j0(1.7), -0.1, -1.47, 0.0]  # TUNED IN UNITY (j0 wrapped)
        cur = self.current_positions

        self.send_trajectory([
            [cur[0], -0.5, -0.5, cur[3]],
            [target[0], -0.5, -0.5, target[3]],
            target
        ])

        self.wait_until_reached(target)

    def move_robot_pick_gear(self, x, y):
        self.node.get_logger().info(f"Moving to PICK GEAR at ({x}, {y})")
        self.send_move(x, y, -0.089)  # z=-0.089 is the height for picking up the gear
        self.wait_for_motion(duration=10)  # give MoveIt time to plan+execute
        self.send_gripper_and_wait("grip_close")

    # ─────────────────────────────────────────────
    def wait_until_reached(self, target_positions, tolerance=0.03, timeout=15.0, poll_dt=0.05):
        """
        Blocks until current_positions is within `tolerance` of target_positions,
        or until `timeout` seconds pass. Spins the node manually so joint_states
        keeps updating during the wait (since we're inside a callback).
        """
        start = time.time()
        diffs = []
        while time.time() - start < timeout:
            rclpy.spin_once(self.node, timeout_sec=poll_dt)

            diffs = [abs(c - t) for c, t in zip(self.current_positions, target_positions)]
            if all(d <= tolerance for d in diffs):
                self.node.get_logger().info(
                    f"Target reached in {time.time() - start:.2f}s"
                )
                return True

        self.node.get_logger().warn(
            f"Timeout waiting for target, diffs={diffs}"
        )
        return False

    def wait_for_gripper(self, target_state: str, timeout=8.0, poll_dt=0.05):
        """
        Blocks until /gripper_status reports target_state ('open' or 'closed'),
        spinning the node manually so the topic actually updates.
        """
        start = time.time()
        while time.time() - start < timeout:
            rclpy.spin_once(self.node, timeout_sec=poll_dt)
            if self.gripper_state == target_state:
                self.node.get_logger().info(f"Gripper reached '{target_state}'")
                return True
        self.node.get_logger().warn(
            f"Timeout waiting for gripper '{target_state}', last={self.gripper_state}"
        )
        return False

    # ══════════════════════════════════════════════════════════════════════
    # ── NEW: non-blocking async versions for use in a timer-driven state
    #    machine (InspectionNode.tick()). These never call rclpy.spin_once
    #    and never time.sleep — they just kick off a move / gripper action
    #    and let is_async_done() be polled externally each tick.
    #    Old blocking methods above are untouched.
    # ══════════════════════════════════════════════════════════════════════

    def _start_async_move(self, target, gripper_after=None, use_lift=True, settle_sec=0.0):
        cur = self.current_positions
        if use_lift:
            self.send_trajectory([
                [cur[0], -0.5, -0.5, cur[3]],
                [target[0], -0.5, -0.5, target[3]],
                target
            ])
        else:
            self.send_trajectory([target])

        self._async_target = target
        self._async_gripper_after = gripper_after
        self._async_settle_sec = settle_sec
        self._async_phase = "moving"
        self._async_grip_deadline = None

    def is_async_done(self):
        if self._async_phase == "moving":
            diffs = [abs(c - t) for c, t in zip(self.current_positions, self._async_target)]
            if all(d <= self._async_tolerance for d in diffs):
                if self._async_gripper_after:
                    self.send_gripper(self._async_gripper_after)
                    self._async_grip_deadline = time.time() + 8.0
                    self._async_phase = "gripping"
                elif self._async_settle_sec > 0:
                    self._async_settle_deadline = time.time() + self._async_settle_sec
                    self._async_phase = "settling"
                else:
                    self._async_phase = "done"
            return self._async_phase == "done"

        elif self._async_phase == "moveit_wait":
            if time.time() >= self._async_moveit_deadline:
                if self._async_gripper_after:
                    self.send_gripper(self._async_gripper_after)
                    self._async_grip_deadline = time.time() + 8.0
                    self._async_phase = "gripping"
                else:
                    self._async_phase = "done"
            return self._async_phase == "done"

        elif self._async_phase == "gripping":
            target = "closed" if self._async_gripper_after == "grip_close" else "open"
            if self.gripper_state == target:
                self._async_settle_deadline = time.time() + 0.5
                self._async_phase = "settling"
            elif time.time() >= self._async_grip_deadline:
                self.node.get_logger().warn(
                    f"Timeout waiting for gripper '{target}', last={self.gripper_state} — proceeding anyway"
                )
                self._async_settle_deadline = time.time() + 0.5
                self._async_phase = "settling"
            return self._async_phase == "done"

        elif self._async_phase == "settling":
            if time.time() >= self._async_settle_deadline:
                self._async_phase = "done"
            return self._async_phase == "done"

        elif self._async_phase == "done":
            return True

        return False

    def move_to_station_open_async(self):
        self.node.get_logger().info("Moving to INSPECTION STATION (async)")
        target = [self._wrap_j0(3.65), -1.1, -1.3, -0.73]
        self._start_async_move(target, gripper_after="grip_open", use_lift=True)

    def move_to_station_close_async(self):
        self.node.get_logger().info("Moving to INSPECTION STATION (async)")
        target = [self._wrap_j0(3.65), -1.25, -1.2, -0.73]
        self._start_async_move(target, gripper_after="grip_close", use_lift=True)

    def move_robot_to_reject_bin_async(self):
        self.node.get_logger().info("Moving to reject bin (async)")
        target = [self._wrap_j0(-1.27), -0.9, -1.0, -1.3]
        self._start_async_move(target, gripper_after="grip_open", use_lift=True)

    def move_robot_to_good_bin_async(self):
        self.node.get_logger().info("Moving to good bin (async)")
        target = [self._wrap_j0(1.81), -0.6, -1.4, -1.0]
        self._start_async_move(target, gripper_after="grip_open", use_lift=True)

    def move_robot_to_Top_View_async(self):
        self.node.get_logger().info("Moving to TOP VIEW (async)")
        target = [self._wrap_j0(3.65), -1.0, -0.6, 0.3]
        self._start_async_move(target, gripper_after=None, use_lift=False)          # no lift needed

    def move_robot_to_Pick_View_async(self):
        self.node.get_logger().info("Moving to PICK VIEW (async)")
        target = [self._wrap_j0(1.7), -0.1, -1.47, 0.0]
        self._start_async_move(target, gripper_after="grip_open", use_lift=False, settle_sec=5.0)  # was missing settle_sec

    def move_robot_pick_gear_async(self, x, y):
        self.node.get_logger().info(f"Moving to PICK GEAR at ({x}, {y}) (async)")
        self.send_move(x, y, -0.089)
        self._async_target = None
        self._async_gripper_after = "grip_close"
        self._async_settle_sec = 0.0
        self._async_phase = "moveit_wait"
        self._async_moveit_deadline = time.time() + 3.5

   