// WonderMoves — MCU side (STM32 on UNO Q).
// Reads the Modulino sensors and streams raw samples to the Linux side over the Bridge.
// All game logic, calibration and detection live in python/main.py.

#include <Arduino_RouterBridge.h>
#include <Modulino.h>

ModulinoDistance distance;
ModulinoMovement movement;
ModulinoThermo thermo;

bool hasDistance = false, hasMovement = false, hasThermo = false;
unsigned long lastFast = 0, lastThermo = 0, lastStatus = 0;
unsigned long distanceSeen = 0, imuSeen = 0;   // samples since the last status report
int lastDistanceMm = -1;

void probeSensors() {
  // Retry any sensor that is missing, so a loose Qwiic plug can be fixed without a restart.
  if (!hasDistance) hasDistance = distance.begin();
  if (!hasMovement) hasMovement = movement.begin();
  if (!hasThermo) hasThermo = thermo.begin();
}

void setup() {
  Bridge.begin();
  Modulino.begin(Wire1);  // Qwiic connector is on Wire1 on the UNO Q
  probeSensors();
}

void loop() {
  unsigned long now = millis();

  // ~50 Hz: distance + IMU
  if (now - lastFast >= 20) {
    lastFast = now;
    // available() is false when nothing is in range (e.g. the sensor faces the ceiling).
    if (hasDistance && distance.available()) {
      lastDistanceMm = (int)distance.get();
      distanceSeen++;
      Bridge.notify("distance", lastDistanceMm);  // millimetres
    }
    if (hasMovement && movement.update()) {
      imuSeen++;
      Bridge.notify("imu",
                    movement.getX(), movement.getY(), movement.getZ(),            // accel (g)
                    movement.getRoll(), movement.getPitch(), movement.getYaw());  // gyro (dps)
    }
  }

  // 0.2 Hz: room temperature/humidity (comfort check only)
  if (hasThermo && now - lastThermo >= 5000) {
    lastThermo = now;
    Bridge.notify("thermo", thermo.getTemperature(), thermo.getHumidity());
  }

  // 1 Hz: which sensors are connected and whether they are producing data
  if (now - lastStatus >= 1000) {
    lastStatus = now;
    probeSensors();
    Bridge.notify("sensor_status", hasDistance, hasMovement, hasThermo,
                  (int)distanceSeen, (int)imuSeen, lastDistanceMm);
    distanceSeen = imuSeen = 0;
  }
}
