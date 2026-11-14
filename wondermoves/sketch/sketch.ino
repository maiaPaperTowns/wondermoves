// WonderMoves — MCU side (STM32 on UNO Q).
// Reads the Modulino sensors and streams raw samples to the Linux side over the Bridge.
// All game logic, calibration and detection live in python/main.py.

#include <Arduino_RouterBridge.h>
#include <Modulino.h>

ModulinoDistance distance;
ModulinoMovement movement;
ModulinoThermo thermo;

bool hasDistance = false, hasMovement = false, hasThermo = false;
unsigned long lastFast = 0, lastSlow = 0;

void setup() {
  Bridge.begin();
  Modulino.begin(Wire1);  // Qwiic connector is on Wire1 on the UNO Q
  hasDistance = distance.begin();
  hasMovement = movement.begin();
  hasThermo = thermo.begin();
  Bridge.notify("sensors_ready", hasDistance, hasMovement, hasThermo);
}

void loop() {
  unsigned long now = millis();

  // ~50 Hz: distance + IMU
  if (now - lastFast >= 20) {
    lastFast = now;
    if (hasDistance && distance.available()) {
      Bridge.notify("distance", (int)distance.get());  // millimetres
    }
    if (hasMovement && movement.update()) {
      Bridge.notify("imu",
                    movement.getX(), movement.getY(), movement.getZ(),            // accel (g)
                    movement.getRoll(), movement.getPitch(), movement.getYaw());  // gyro (dps)
    }
  }

  // 0.2 Hz: room temperature/humidity (comfort check only)
  if (hasThermo && now - lastSlow >= 5000) {
    lastSlow = now;
    Bridge.notify("thermo", thermo.getTemperature(), thermo.getHumidity());
  }
}
