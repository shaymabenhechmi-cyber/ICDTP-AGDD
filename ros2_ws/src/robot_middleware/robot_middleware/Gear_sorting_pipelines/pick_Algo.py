
import socket
import json

PC_IP   = "127.0.0.1"   # ← replace with your PC's IP
PC_PORT = 5555
TIMEOUT = 60.0             # seconds — enough for validate_top_view() to finish


def Pick_Algo():
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(TIMEOUT)
            s.connect((PC_IP, PC_PORT))

            s.sendall(json.dumps({
                "view": "pick"
            }).encode())

            
            data = b""

            while True:
                try:
                    chunk = s.recv(4096)
                    if not chunk:
                        break
                    data += chunk
                except socket.timeout:
                    break

        result = json.loads(data.decode())

        gears = result.get("gears", [])
        detections = result.get("detections", [])
        gear_table = result.get("gear_table", [])

        return gears, detections, gear_table, result

    except Exception as e:
        print(f"[REMOTE] ❌ Failed to reach PC: {e}")
        return None, None, None, None