#!/usr/bin/env python3

import os
import json

PIPELINE_STATE_FILE = "/tmp/agdd_pipeline_state.json"
import threading
import urllib.request
import urllib.error
from datetime import datetime

import rclpy
from rclpy.node import Node
from std_msgs.msg import Float32

from robot_middleware.Gear_sorting_pipelines.move_robot import RobotMover
from robot_middleware.Gear_sorting_pipelines.top_view_pipeline import validate_top_view
from robot_middleware.Gear_sorting_pipelines.side_view_pipeline import validate_side_view
from robot_middleware.Gear_sorting_pipelines.pick_Algo import Pick_Algo


class InspectionNode(Node):

    SERVO_TOPIC = '/inspection_servo_cmd'
    ROTATE_WAIT_SEC = 2.0

    # Spring Boot runs on Windows host
    INSPECTION_API_URL = (
        "http://192.168.100.11:8080/api/inspection/results"
    )

    def __init__(self):
        super().__init__('inspection_node')

        self.servo_pub = self.create_publisher(
            Float32,
            self.SERVO_TOPIC,
            10
        )

        self.get_logger().info("Inspection node started")
        self.get_logger().info(
            f"Inspection DB API: {self.INSPECTION_API_URL}"
        )

        self.robot_mover = RobotMover(self)

        self.step = 0

        self._rotate_deadline = None
        self._settle_deadline = None
        self._pick_retry_deadline = None

        self.top_status = None
        self.top_details = None

        self.side_status = None
        self.side_details = None

        self.current_gear_id = None

        self._pick_thread = None
        self._pick_result = None

        self._top_thread = None
        self._top_result = None

        self._side_thread = None
        self._side_result = None

        # DB saving thread
        self._db_thread = None
        self._db_result = None
        self._db_save_started = False

        # non-blocking state machine
        self.create_timer(0.1, self.tick)

    # ============================================================
    # PIPELINE THREADS
    # ============================================================

    def _run_pick_algo(self):
        try:
            self._pick_result = Pick_Algo()
        except Exception as e:
            self._pick_result = None
            self.get_logger().error(
                f"Pick_Algo failed: {type(e).__name__}: {e}"
            )

    def _run_top_view(self):
        try:
            self._top_result = validate_top_view()
        except Exception as e:
            self._top_result = ("Uncertain", {
                "error": str(e)
            })

            self.get_logger().error(
                f"Top validation failed: {type(e).__name__}: {e}"
            )

    def _run_side_view(self):
        try:
            self._side_result = validate_side_view()
        except Exception as e:
            self._side_result = ("Uncertain", {
                "error": str(e)
            })

            self.get_logger().error(
                f"Side validation failed: {type(e).__name__}: {e}"
            )

    # ============================================================
    # DATABASE THREAD
    # ============================================================

    def _run_db_save(self):
        self._db_result = self.save_inspection_result(
            self.current_gear_id,
            self.top_status,
            self.top_details,
            self.side_status,
            self.side_details
        )

    # ============================================================
    # HELPERS
    # ============================================================

    @staticmethod
    def _get_value(details, *keys):
        """
        Safely extract a value from pipeline details.

        Supports dictionaries and objects.
        """
        if details is None:
            return None

        if isinstance(details, dict):
            for key in keys:
                if key in details:
                    return details[key]
            return None

        for key in keys:
            try:
                value = getattr(details, key)
                return value
            except AttributeError:
                pass

        return None

    @staticmethod
    def _to_float(value):
        if value is None:
            return None

        try:
            return float(value)
        except (TypeError, ValueError):
            return None

    @staticmethod
    def _to_int(value):
        if value is None:
            return None

        try:
            return int(value)
        except (TypeError, ValueError):
            return None

    # ============================================================
    # SAVE INSPECTION TO SPRING BOOT / MYSQL
    # ============================================================

    def save_inspection_result(
        self,
        gear_id,
        top_status,
        top_details,
        side_status,
        side_details
    ):
        """
        Send the final inspection result to Spring Boot.

        Spring Boot endpoint:
            POST /api/inspection/results

        Spring Boot then saves the result into:
            agdd_db.inspections
        """

        try:

            # ----------------------------------------------------
            # TOP DATA
            # ----------------------------------------------------

            top_status = top_status or "Uncertain"

            outer_diameter = self._to_float(
                self._get_value(
                    top_details,
                    "outer",
                    "outer_diameter",
                    "outerDiameter"
                )
            )

            inner_diameter = self._to_float(
                self._get_value(
                    top_details,
                    "inner",
                    "inner_diameter",
                    "innerDiameter"
                )
            )

            teeth_count = self._to_int(
                self._get_value(
                    top_details,
                    "teeth",
                    "teeth_count",
                    "teethCount"
                )
            )

            # ----------------------------------------------------
            # SIDE DATA
            # ----------------------------------------------------

            side_status = side_status or "Uncertain"

            height_mm = self._to_float(
                self._get_value(
                    side_details,
                    "height_mm",
                    "heightMm",
                    "height"
                )
            )

            helix_deg = self._to_float(
                self._get_value(
                    side_details,
                    "helix_deg",
                    "helixDeg",
                    "helix"
                )
            )

            # ----------------------------------------------------
            # FINAL STATUS
            # ----------------------------------------------------

            if (
                top_status == "Defected"
                or side_status == "Defected"
            ):
                final_status = "DEFECT"

            elif (
                top_status == "Uncertain"
                or side_status == "Uncertain"
            ):
                final_status = "UNCERTAIN"

            else:
                final_status = "OK"

            # ----------------------------------------------------
            # DEFECT TYPE
            # ----------------------------------------------------

            defect_type = None

            # Top defect
            if top_status == "Defected":

                defect_type = self._get_value(
                    top_details,
                    "defect_type",
                    "defectType",
                    "class_name",
                    "className",
                    "label",
                    "class"
                )

            # Side defect
            if (
                not defect_type
                and side_status == "Defected"
            ):

                defect_type = self._get_value(
                    side_details,
                    "defect_type",
                    "defectType",
                    "class_name",
                    "className",
                    "label",
                    "class"
                )

            # Generic fallback
            if final_status == "DEFECT" and not defect_type:
                defect_type = "Defect_Gear"

            # ----------------------------------------------------
            # PIECE ID
            # ----------------------------------------------------

            if gear_id is None:
                gear_id = 0

            piece_id = (
                "GEAR-"
                + datetime.now().strftime("%Y%m%d-%H%M%S")
                + "-"
                + str(gear_id)
            )

            # ----------------------------------------------------
            # PAYLOAD
            # ----------------------------------------------------

            payload = {
                "pieceId": piece_id,
                "status": final_status,
                "defectType": defect_type,
                "topStatus": top_status,
                "sideStatus": side_status,
                "outerDiameter": outer_diameter,
                "innerDiameter": inner_diameter,
                "teethCount": teeth_count,
                "heightMm": height_mm,
                "helixDeg": helix_deg
            }

            self.get_logger().info(
                "[DB] Sending inspection result..."
            )

            self.get_logger().info(
                f"[DB] piece={piece_id} | "
                f"status={final_status} | "
                f"top={top_status} | "
                f"side={side_status}"
            )

            self.get_logger().info(
                f"[DB] measurements: "
                f"outer={outer_diameter}, "
                f"inner={inner_diameter}, "
                f"teeth={teeth_count}, "
                f"height={height_mm}, "
                f"helix={helix_deg}"
            )

            # ----------------------------------------------------
            # HTTP POST
            # ----------------------------------------------------

            data = json.dumps(payload).encode("utf-8")

            request = urllib.request.Request(
                self.INSPECTION_API_URL,
                data=data,
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                method="POST"
            )

            with urllib.request.urlopen(
                request,
                timeout=5
            ) as response:

                response_body = (
                    response
                    .read()
                    .decode("utf-8")
                )

                if 200 <= response.status < 300:

                    self.get_logger().info(
                        f"[DB] SUCCESS - inspection saved | "
                        f"piece={piece_id}"
                    )

                    self.get_logger().info(
                        f"[DB] Spring Boot response: "
                        f"{response_body}"
                    )

                    return True

                self.get_logger().error(
                    f"[DB] HTTP {response.status}"
                )

                return False

        except urllib.error.HTTPError as e:

            try:
                error_body = e.read().decode("utf-8")
            except Exception:
                error_body = ""

            self.get_logger().error(
                f"[DB] HTTP error {e.code}: {error_body}"
            )

            return False

        except urllib.error.URLError as e:

            self.get_logger().error(
                f"[DB] Cannot reach Spring Boot: {e}"
            )

            return False

        except Exception as e:

            self.get_logger().error(
                f"[DB] Save failed: "
                f"{type(e).__name__}: {e}"
            )

            return False

    # ============================================================
    # RESET
    # ============================================================

    def _reset_cycle_state(self):
        """
        Clear per-cycle state so the next gear starts clean.
        """

        self._pick_thread = None
        self._pick_result = None

        self._top_thread = None
        self._top_result = None

        self._side_thread = None
        self._side_result = None

        self._db_thread = None
        self._db_result = None
        self._db_save_started = False

        self._rotate_deadline = None
        self._settle_deadline = None
        self._pick_retry_deadline = None

        self.top_status = None
        self.top_details = None

        self.side_status = None
        self.side_details = None

        self.current_gear_id = None

    # ============================================================
    # STATE MACHINE
    # ============================================================

    def _set_dashboard_stage(self, stage, state="running", message=""):
        """Publish the current inspection stage for the AGDD dashboard."""
        try:
            data = {
                "state": state,
                "step": stage,
                "message": message
            }

            tmp_file = PIPELINE_STATE_FILE + ".tmp"

            with open(tmp_file, "w") as f:
                json.dump(data, f)

            os.replace(tmp_file, PIPELINE_STATE_FILE)

        except Exception as e:
            self.get_logger().warn(
                f"Dashboard state update failed: {e}"
            )

    def _set_dashboard_stopped(self):
        """Mark the inspection pipeline as stopped."""
        try:
            data = {
                "state": "idle",
                "step": None,
                "message": "Pipeline stopped."
            }

            tmp_file = PIPELINE_STATE_FILE + ".tmp"

            with open(tmp_file, "w") as f:
                json.dump(data, f)

            os.replace(tmp_file, PIPELINE_STATE_FILE)

        except Exception as e:
            self.get_logger().warn(
                f"Dashboard stopped-state update failed: {e}"
            )

    def tick(self):

        # ========================================================
        # STEP 0
        # ========================================================

        if self.step == 0:
            self._set_dashboard_stage("PICK", "running", "Pipeline started.")

            self.get_logger().info(
                "Starting inspection sequence"
            )

            self.robot_mover.move_robot_to_Pick_View_async()

            self.step = 1

        # ========================================================
        # STEP 1 - PICK
        # ========================================================

        elif self.step == 1:
            self._set_dashboard_stage("DETECT", "running", "Detecting gear.")

            if self.robot_mover.is_async_done():

                if self._pick_thread is None:

                    self.get_logger().info(
                        "Starting Pick_Algo..."
                    )

                    self._pick_thread = threading.Thread(
                        target=self._run_pick_algo,
                        daemon=True
                    )

                    self._pick_thread.start()

                    return

                if self._pick_thread.is_alive():
                    return

                if self._pick_result is None:

                    self.get_logger().error(
                        "Pick_Algo returned no result."
                    )

                    self._pick_retry_deadline = (
                        self.get_clock().now().nanoseconds / 1e9
                        + 2.0
                    )

                    self.step = 1.5
                    return

                gears, detections, gear_table, result = (
                    self._pick_result
                )

                if not gear_table:

                    self.get_logger().warn(
                        "No gear found — staying in PICK VIEW "
                        "and waiting for next gear..."
                    )

                    self._pick_retry_deadline = (
                        self.get_clock().now().nanoseconds / 1e9
                        + 2.0
                    )

                    self.step = 1.5
                    return

                gear = gear_table[0]

                self.current_gear_id = gear.get("id", 0)

                x_m = gear["robot_x"] / 1000.0
                y_m = gear["robot_y"] / 1000.0

                self.get_logger().info(
                    f"Gear #{self.current_gear_id} "
                    f"at robot="
                    f"({gear['robot_x']:.2f}, "
                    f"{gear['robot_y']:.2f}) mm "
                    f"-> ({x_m:.4f}, {y_m:.4f}) m"
                )

                self.robot_mover.move_robot_pick_gear_async(
                    x_m,
                    -y_m + 0.02
                )

                self.step = 2

        # ========================================================
        # STEP 1.5 - PICK RETRY
        # ========================================================

        elif self.step == 1.5:
            self._set_dashboard_stage("DETECT", "running", "Waiting for a gear.")

            now = (
                self.get_clock().now().nanoseconds / 1e9
            )

            if now < self._pick_retry_deadline:
                return

            self.get_logger().info(
                "Retrying Pick_Algo — waiting for a gear..."
            )

            self._pick_thread = threading.Thread(
                target=self._run_pick_algo,
                daemon=True
            )

            self._pick_thread.start()

            self.step = 1

        # ========================================================
        # STEP 2 - PICK COMPLETE
        # ========================================================

        elif self.step == 2:
            self._set_dashboard_stage("GRIP", "running", "Gripping gear.")

            if self.robot_mover.is_async_done():

                self.rotate_platform_async(0.0)

                self.step = 3

        # ========================================================
        # STEP 3 - ROTATE
        # ========================================================

        elif self.step == 3:
            self._set_dashboard_stage("GRIP", "running", "Positioning gear.")

            if self.rotate_done():

                self.robot_mover.move_to_station_open_async()

                self.step = 4

        # ========================================================
        # STEP 4 - MOVE TO STATION
        # ========================================================

        elif self.step == 4:
            self._set_dashboard_stage("GRIP", "running", "Moving gear to inspection station.")

            if self.robot_mover.is_async_done():

                self.robot_mover.move_robot_to_Top_View_async()

                self.step = 5

        # ========================================================
        # STEP 5 - SETTLE
        # ========================================================

        elif self.step == 5:
            self._set_dashboard_stage("GRIP", "running", "Preparing inspection.")

            if self.robot_mover.is_async_done():

                self._settle_deadline = (
                    self.get_clock().now().nanoseconds / 1e9
                    + 5.0
                )

                self.step = 6

        # ========================================================
        # STEP 6 - TOP + SIDE
        # ========================================================

        elif self.step == 6:
            self._set_dashboard_stage("INSPECT", "running", "Inspecting gear.")

            now = (
                self.get_clock().now().nanoseconds / 1e9
            )

            if now < self._settle_deadline:
                return

            if (
                self._top_thread is None
                and self._side_thread is None
            ):

                self.get_logger().info(
                    "Starting top + side validation in parallel..."
                )

                self._top_thread = threading.Thread(
                    target=self._run_top_view,
                    daemon=True
                )

                self._side_thread = threading.Thread(
                    target=self._run_side_view,
                    daemon=True
                )

                self._top_thread.start()
                self._side_thread.start()

                return

            if (
                self._top_thread.is_alive()
                or self._side_thread.is_alive()
            ):
                return

            # ----------------------------------------------------
            # VALIDATION RESULTS
            # ----------------------------------------------------

            self.top_status, self.top_details = (
                self._top_result
            )

            self.side_status, self.side_details = (
                self._side_result
            )

            self.get_logger().info(
                f"Top  => {self.top_status} | "
                f"{self.top_details}"
            )

            self.get_logger().info(
                f"Side => {self.side_status} | "
                f"{self.side_details}"
            )

            # ----------------------------------------------------
            # CLOSE STATION
            # ----------------------------------------------------

            self.robot_mover.move_to_station_close_async()

            self.step = 65

        # ========================================================
        # STEP 65 - SAVE DB + SORT
        # ========================================================

        elif self.step == 65:
            self._set_dashboard_stage("DECIDE", "running", "Deciding inspection result.")

            if not self.robot_mover.is_async_done():
                return

            # ----------------------------------------------------
            # START DB SAVE ONLY ONCE
            # ----------------------------------------------------

            if not self._db_save_started:

                self._db_save_started = True

                self.get_logger().info(
                    "[DB] Starting database save..."
                )

                self._db_thread = threading.Thread(
                    target=self._run_db_save,
                    daemon=True
                )

                self._db_thread.start()

            # ----------------------------------------------------
            # IMPORTANT:
            # Do NOT wait for HTTP here.
            #
            # The robot continues its normal sorting cycle.
            # ----------------------------------------------------

            if (
                self.top_status == "Defected"
                or self.side_status == "Defected"
            ):

                self._set_dashboard_stage("SORT", "running", "Sorting defective gear.")

                self.handle_defective_part(
                    self.top_details,
                    self.side_details
                )

                self.step = 90
                return

            self._set_dashboard_stage("SORT", "running", "Sorting healthy gear.")
            self.handle_good_part()

            self.step = 8

        # ========================================================
        # STEP 8 - GOOD COMPLETE
        # ========================================================

        elif self.step == 8:
            self._set_dashboard_stage("RELEASE", "running", "Releasing healthy gear.")

            if self.robot_mover.is_async_done():

                self.get_logger().info(
                    "🔁 Cycle complete — pausing before next gear"
                )

                self._reset_cycle_state()

                self._settle_deadline = (
                    self.get_clock().now().nanoseconds / 1e9
                    + 1.0
                )

                self.step = 95

        # ========================================================
        # STEP 90 - DEFECT COMPLETE
        # ========================================================

        elif self.step == 90:
            self._set_dashboard_stage("RELEASE", "running", "Releasing defective gear.")

            if self.robot_mover.is_async_done():

                self.get_logger().warn(
                    "🔁 Defective part sorted — "
                    "pausing before next gear"
                )

                self._reset_cycle_state()

                self._settle_deadline = (
                    self.get_clock().now().nanoseconds / 1e9
                    + 1.0
                )

                self.step = 95

        # ========================================================
        # STEP 95 - NEXT CYCLE
        # ========================================================

        elif self.step == 95:
            self._set_dashboard_stage("COMPLETE", "running", "Inspection cycle complete.")

            now = (
                self.get_clock().now().nanoseconds / 1e9
            )

            if now < self._settle_deadline:
                return

            self.step = 0

        # ========================================================
        # STEP 99
        # ========================================================

        elif self.step == 99:
            pass

    # ============================================================
    # ROBOT HELPERS
    # ============================================================

    def rotate_platform_async(self, angle):

        msg = Float32()
        msg.data = angle

        self.servo_pub.publish(msg)

        self.get_logger().info(
            f"Rotate {angle}°"
        )

        self._rotate_deadline = (
            self.get_clock().now().nanoseconds / 1e9
            + self.ROTATE_WAIT_SEC
        )

    def rotate_done(self):

        now = (
            self.get_clock().now().nanoseconds / 1e9
        )

        return (
            self._rotate_deadline is not None
            and now >= self._rotate_deadline
        )

    def handle_defective_part(self, *details):

        self.get_logger().warn(
            f"❌ DEFECTIVE: {details}"
        )

        self.robot_mover.move_robot_to_reject_bin_async()

    def handle_good_part(self):

        self.get_logger().info(
            "✅ GOOD PART"
        )

        self.robot_mover.move_robot_to_good_bin_async()


def main(args=None):

    rclpy.init(args=args)

    node = InspectionNode()

    try:
        rclpy.spin(node)
    except KeyboardInterrupt:
        pass
    finally:
        try:
            node.destroy_node()
        except Exception:
            pass

        try:
            if rclpy.ok():
                rclpy.shutdown()
        except Exception:
            pass


if __name__ == '__main__':
    main()
