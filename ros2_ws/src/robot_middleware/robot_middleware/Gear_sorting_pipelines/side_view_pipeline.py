"""
Drop-in replacement for top_view_pipeline.py on the Pi.
Delegates to the PC vision server over TCP instead of running locally.
"""
import socket
import json

PC_IP   = "127.0.0.1"   # ← replace with your PC's IP
PC_PORT = 5555
TIMEOUT = 60.0             # seconds — enough for validate_top_view() to finish


def validate_side_view():
    print("[REMOTE] Requesting side view validation from PC...")
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(TIMEOUT)
            s.connect((PC_IP, PC_PORT))
            s.sendall(json.dumps({"view": "side"}).encode())

            data = b""
            while True:
                chunk = s.recv(4096)
                if not chunk:
                    break
                data += chunk

        result = json.loads(data.decode())

        state = {
            "yolo_class": result.get("gear_class", ""),
            "height_mm":  result.get("height_mm", 0.0),
            "helix_deg":  result.get("helix_deg", 0.0),
            "yolo":       [],
            "final_ok":   not result.get("defective", True),
        }

        status = result.get("status", "Uncertain")
        print(f"[REMOTE] {status} | class={state['yolo_class']} "
              f"H={state['height_mm']:.1f}mm Helix={state['helix_deg']:.1f}deg")
        return status, state

    except Exception as e:
        print(f"[REMOTE] ❌ Failed to reach PC: {e}")
        return "Uncertain", {}