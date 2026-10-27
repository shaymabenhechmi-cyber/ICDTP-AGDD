#!/usr/bin/env python3
"""
fake_stm32_node.py — Drop-in simulation replacement for stm32_serial_node.py.

Same ROS interface as the real node (so unity_moveit_bridge and Unity
don't notice the difference), but with NO serial port, NO pyserial,
and NO real hardware:

  - Receives planned trajectories from unity_moveit_bridge (/planned_trajectory)
  - Interpolates waypoints at ~50ms intervals (identical logic to the real node,
    but directly in radians — no step conversion, no STM32 protocol)
  - Animates the gripper open/closed over a fixed duration on /stm32_cmd
  - Publishes /joint_states (7 joints: 4 arm + 3 fingers)
  - Accepts the same 'reset' / 'home' / 'grip_open' / 'grip_close' / 'estop'
    commands on /stm32_cmd (estop just freezes the current trajectory)

Use this instead of stm32_serial_node.py whenever you want to run the
Unity digital twin without a robot/STM32 plugged in.
"""

import time
import math

import rclpy
from rclpy.node import Node
from sensor_msgs.msg import JointState
from trajectory_msgs.msg import JointTrajectory
from std_msgs.msg import String


class FakeSTM32Node(Node):
    def __init__(self):
        super().__init__('fake_stm32_node')
        self.gripper_status_pub = self.create_publisher(String, '/gripper_status', 10)

        self.declare_parameter('report_interval_ms', 50)
        self.declare_parameter('gripper_travel_time', 1.0)  # seconds, open<->closed

        self.report_interval = self.get_parameter('report_interval_ms').value / 1000.0
        self.gripper_travel_time = self.get_parameter('gripper_travel_time').value

        self.arm_joints = ['joint_basis_arm1', 'joint_arm1_arm2',
                            'joint_arm2_arm3', 'joint_arm3_greifer']
        self.finger_joints = ['joint_greifer_finger1',
                               'joint_greifer_finger2', 'joint_greifer_finger3']

        # Finger open/closed values copied from stm32_calibration.yaml defaults.
        # If your real fingers use different limits, adjust here or load via params.
        self.finger_open_val = 0.0
        self.finger_closed_val = 0.6

        # ── State ───────────────────────────────────────────────────────
        self.current_arm = {j: 0.0 for j in self.arm_joints}
        self.gripper_progress = 0.0       # 0.0 = open, 1.0 = closed
        self.gripper_target = 0.0
        self.gripper_move_start = None
        self.gripper_move_from = 0.0
        self.estopped = False

        # Trajectory interpolation state
        self.trajectory = None
        self.traj_start_time = None
        self.traj_joint_names = []

        # ── Publishers ──────────────────────────────────────────────────
        self.joint_state_pub = self.create_publisher(JointState, '/joint_states', 10)

        # ── Subscribers ─────────────────────────────────────────────────
        self.create_subscription(
            JointTrajectory, '/planned_trajectory', self.trajectory_callback, 10)
        self.create_subscription(
            String, '/stm32_cmd', self.cmd_callback, 10)

        # ── Main loop timer ────────────────────────────────────────────
        self.timer = self.create_timer(self.report_interval, self.main_loop)

        self.get_logger().info(
            'Fake STM32 node started — no serial port, pure simulation.')

    # ════════════════════════════════════════════════════════════════════
    #  Trajectory interpolation (same math as the real node, in radians)
    # ════════════════════════════════════════════════════════════════════

    def trajectory_callback(self, msg: JointTrajectory):
        if len(msg.points) == 0:
            self.get_logger().warn('Empty trajectory received.')
            return
        if self.estopped:
            self.get_logger().warn('Ignoring trajectory — E-STOP active. Send "reset" first.')
            return

        self.trajectory = msg
        self.traj_start_time = time.monotonic()
        self.traj_joint_names = list(msg.joint_names)

        self.get_logger().info(f'Trajectory received: {len(msg.points)} waypoints')
    def publish_gripper_status(self):
        if self.gripper_move_start is not None:
            state = "moving"
        elif self.gripper_progress >= 0.99:
            state = "closed"
        elif self.gripper_progress <= 0.01:
            state = "open"
        else:
            state = "moving"

        msg = String()
        msg.data = state
        self.gripper_status_pub.publish(msg)
    def interpolate_trajectory(self):
        if self.trajectory is None or self.traj_start_time is None:
            return None

        elapsed = time.monotonic() - self.traj_start_time
        points = self.trajectory.points
        joint_names = self.traj_joint_names

        times = [pt.time_from_start.sec + pt.time_from_start.nanosec * 1e-9
                 for pt in points]

        if elapsed >= times[-1]:
            result = {name: points[-1].positions[j] for j, name in enumerate(joint_names)}
            self.trajectory = None
            self.traj_start_time = None
            self.get_logger().info('Trajectory completed.')
            return result

        idx = 0
        for i in range(len(times) - 1):
            if times[i] <= elapsed <= times[i + 1]:
                idx = i
                break

        t0, t1 = times[idx], times[idx + 1]
        alpha = (elapsed - t0) / (t1 - t0) if (t1 - t0) > 0 else 1.0

        return {
            name: points[idx].positions[j] + alpha * (points[idx + 1].positions[j] - points[idx].positions[j])
            for j, name in enumerate(joint_names)
        }

    # ════════════════════════════════════════════════════════════════════
    #  Gripper animation
    # ════════════════════════════════════════════════════════════════════

    def start_gripper_move(self, target: float):
        self.gripper_move_from = self.gripper_progress
        self.gripper_target = target
        self.gripper_move_start = time.monotonic()

    def update_gripper(self):
        if self.gripper_move_start is None:
            return
        elapsed = time.monotonic() - self.gripper_move_start
        alpha = min(1.0, elapsed / max(self.gripper_travel_time, 1e-3))
        self.gripper_progress = self.gripper_move_from + alpha * (self.gripper_target - self.gripper_move_from)
        if alpha >= 1.0:
            self.gripper_move_start = None

    def finger_value(self, progress: float) -> float:
        return self.finger_open_val + progress * (self.finger_closed_val - self.finger_open_val)

    # ════════════════════════════════════════════════════════════════════
    #  Commands
    # ════════════════════════════════════════════════════════════════════

    def cmd_callback(self, msg: String):
        cmd = msg.data.strip().lower()

        if cmd == 'reset':
            self.get_logger().info('[SIM] Reset — clearing E-STOP, returning to home.')
            self.estopped = False
            self.current_arm = {j: 0.0 for j in self.arm_joints}
            self.trajectory = None
            self.traj_start_time = None
            self.start_gripper_move(0.0)
        elif cmd == 'estop':
            self.get_logger().warn('[SIM] E-STOP — freezing trajectory.')
            self.estopped = True
            self.trajectory = None
            self.traj_start_time = None
        elif cmd == 'grip_open':
            self.get_logger().info('[SIM] Gripper opening...')
            self.start_gripper_move(0.0)
        elif cmd == 'grip_close':
            self.get_logger().info('[SIM] Gripper closing...')
            self.start_gripper_move(1.0)
        elif cmd.startswith('home'):
            self.get_logger().info('[SIM] Homing — all joints to 0.')
            self.estopped = False
            self.current_arm = {j: 0.0 for j in self.arm_joints}
            self.trajectory = None
            self.traj_start_time = None
            self.start_gripper_move(0.0)
        else:
            self.get_logger().warn(f'Unknown command: {cmd}')

    # ════════════════════════════════════════════════════════════════════
    #  Publish /joint_states
    # ════════════════════════════════════════════════════════════════════

    def publish_joint_states(self):
        names = list(self.arm_joints)
        positions = [self.current_arm[j] for j in self.arm_joints]

        for fj in self.finger_joints:
            names.append(fj)
            positions.append(self.finger_value(self.gripper_progress))

        msg = JointState()
        msg.header.stamp = self.get_clock().now().to_msg()
        msg.name = names
        msg.position = positions
        msg.velocity = [0.0] * len(names)
        msg.effort = [0.0] * len(names)
        self.joint_state_pub.publish(msg)

    # ════════════════════════════════════════════════════════════════════
    #  Main loop
    # ════════════════════════════════════════════════════════════════════

    def main_loop(self):
        self.update_gripper()

        if not self.estopped:
            target = self.interpolate_trajectory()
            if target is not None:
                for jname in self.arm_joints:
                    if jname in target:
                        self.current_arm[jname] = target[jname]

        self.publish_joint_states()
        self.publish_gripper_status()


def main(args=None):
    rclpy.init(args=args)
    node = FakeSTM32Node()
    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        node.destroy_node()
        rclpy.shutdown()


if __name__ == '__main__':
    main()
