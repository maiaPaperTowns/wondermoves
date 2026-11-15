
import asyncio
import json
import cv2
import mediapipe as mp
from websockets.asyncio.server import serve

BaseOptions = mp.tasks.BaseOptions
HandLandmarker = mp.tasks.vision.HandLandmarker
HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
VisionRunningMode = mp.tasks.vision.RunningMode

options = HandLandmarkerOptions(
    base_options=BaseOptions(
        model_asset_path="hand_landmarker.task"
    ),
    running_mode=VisionRunningMode.IMAGE,
    num_hands=1,
)

async def handler(websocket):
    cap = cv2.VideoCapture(0)

    if not cap.isOpened():
        print("Camera unavailable")
        return

    try:
        with HandLandmarker.create_from_options(options) as landmarker:
            while True:
                success, frame = cap.read()
                if not success:
                    break

                frame = cv2.flip(frame, 1)
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)

                image = mp.Image(
                    image_format=mp.ImageFormat.SRGB,
                    data=rgb
                )

                result = landmarker.detect(image)

                if result.hand_landmarks:
                    fingertip = result.hand_landmarks[0][8]

                    await websocket.send(json.dumps({
                        "x": fingertip.x,
                        "y": fingertip.y,
                        "detected": True
                    }))
                else:
                    await websocket.send(json.dumps({
                        "detected": False
                    }))

                await asyncio.sleep(0.03)
    finally:
        cap.release()

async def main():
    async with serve(handler, "127.0.0.1", 8765):
        print("Camera server running on ws://localhost:8765")
        await asyncio.Future()

asyncio.run(main())
