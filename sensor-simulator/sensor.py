import time
import json
import random
import paho.mqtt.client as mqtt
import psutil
import logging
import os
from dotenv import load_dotenv
from datetime import datetime, timezone
import numpy as np
from sklearn.ensemble import IsolationForest

# Train a baseline Isolation Forest
# (In a real system, this would be loaded from a pre-trained model file)
baseline_data = np.array([
    [22.0, 45.0, 20.0, 30.0],
    [24.0, 50.0, 40.0, 40.0],
    [26.0, 55.0, 60.0, 50.0],
    [21.0, 40.0, 10.0, 20.0],
    [23.0, 48.0, 30.0, 35.0]
])
iso_forest = IsolationForest(contamination=0.1, random_state=42)
iso_forest.fit(baseline_data)

def detect_anomaly(state):
    """Detect anomalous multivariable states using ML"""
    features = np.array([[state["temp"], state["hum"], state["cpu"], state["ram"]]])
    prediction = iso_forest.predict(features)
    return bool(prediction[0] == -1)

# Load environment variables
load_dotenv()

# Setup structured logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("SensorSimulator")

BROKER_ADDRESS = os.getenv("MQTT_BROKER", "localhost")
BROKER_PORT = int(os.getenv("MQTT_BROKER_PORT", 1883))
FALLBACK_BROKER = os.getenv("MQTT_FALLBACK_BROKER", "broker.emqx.io")
FALLBACK_PORT = int(os.getenv("MQTT_FALLBACK_PORT", 1883))

TOPIC_ENV = "digital_twin_anshh_991/server_room/env"
TOPIC_CONTROL = "digital_twin_anshh_991/server_room/control"

# State for our 3 sensors
racks = {
    "rack_A": {"temp": 24.0, "hum": 45.0, "cpu": 30, "ram": 50, "network_tx": 0, "network_rx": 0, "disk_usage": 50, "ac_on": False},
    "rack_B": {"temp": 25.5, "hum": 50.0, "cpu": 60, "ram": 70, "network_tx": 0, "network_rx": 0, "disk_usage": 60, "ac_on": False},
    "rack_C": {"temp": 22.0, "hum": 40.0, "cpu": 20, "ram": 30, "network_tx": 0, "network_rx": 0, "disk_usage": 40, "ac_on": False},
}

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        logger.info(f"Connected to MQTT Broker successfully.")
        client.subscribe(TOPIC_CONTROL)
        logger.info(f"Subscribed to control topic: {TOPIC_CONTROL}")
    else:
        logger.error(f"Failed to connect, return code {rc}")

def on_message(client, userdata, msg):
    try:
        command = json.loads(msg.payload.decode())
        logger.info(f"Received Command: {command}")
        
        if command.get("action") == "TOGGLE_AC":
            rack_id = command.get("target")
            if rack_id in racks:
                racks[rack_id]["ac_on"] = command.get("state", False)
                logger.info(f"AC for {rack_id} is now {'ON' if racks[rack_id]['ac_on'] else 'OFF'}")
        
        elif command.get("action") == "TOGGLE_GLOBAL_AC":
            state = command.get("state", False)
            for r in racks:
                racks[r]["ac_on"] = state
            logger.info(f"Global AC is now {'ON' if state else 'OFF'}")
            
        elif command.get("action") == "KILL_RACK":
            rack_id = command.get("target")
            if rack_id in racks:
                racks[rack_id]["temp"] = 99.0
                racks[rack_id]["cpu"] = 100
                logger.critical(f"CHAOS EVENT: Rack {rack_id} has been forcefully killed!")
            
    except Exception as e:
        logger.error(f"Error parsing command: {e}")

def apply_thermostat(state):
    """Auto-thermostat logic"""
    if state["temp"] > 27.5:
        state["ac_on"] = True
    elif state["temp"] < 21.0:
        state["ac_on"] = False

def apply_environmental_physics(state):
    """Thermal physics simulation"""
    if state["ac_on"]:
        state["temp"] -= random.uniform(0.8, 1.6)
        state["hum"] -= random.uniform(0.5, 1.5)
    else:
        heat_generated = (state["cpu"] / 100.0) * 0.6
        state["temp"] += random.uniform(-0.1, 0.2) + heat_generated
        
        if state["hum"] < 55.0:
            state["hum"] += random.uniform(0.2, 0.8)
        else:
            state["hum"] += random.uniform(-0.5, 0.5)

    state["temp"] = max(16.0, state["temp"])
    state["hum"] = max(20.0, min(80.0, state["hum"]))

def main():
    client_id = f"digital_twin_edge_{random.randint(1000, 9999)}"
    client = mqtt.Client(client_id=client_id)
    client.on_connect = on_connect
    client.on_message = on_message

    logger.info(f"Connecting to primary broker at {BROKER_ADDRESS}:{BROKER_PORT}...")
    try:
        client.connect(BROKER_ADDRESS, BROKER_PORT, 5)
    except Exception as e:
        logger.warning(f"Failed to connect to primary broker: {e}")
        logger.info(f"Attempting fallback broker at {FALLBACK_BROKER}:{FALLBACK_PORT}...")
        try:
            client.connect(FALLBACK_BROKER, FALLBACK_PORT, 5)
        except Exception as e2:
            logger.error(f"Failed to connect to fallback broker: {e2}")
            return

    client.loop_start()
    logger.info("Starting simulated multi-sensor data generation. Press Ctrl+C to exit.")
    
    try:
        while True:
            for rack_id, state in racks.items():
                # 1. Workloads (CPU, RAM, Network, Disk)
                if rack_id == "rack_A":
                    state["cpu"] = psutil.cpu_percent(interval=None)
                    state["ram"] = psutil.virtual_memory().percent
                    try:
                        net_io = psutil.net_io_counters()
                        state["network_tx"] = net_io.bytes_sent / (1024 * 1024)
                        state["network_rx"] = net_io.bytes_recv / (1024 * 1024)
                        state["disk_usage"] = psutil.disk_usage('/').percent
                    except Exception:
                        pass
                else:
                    if random.random() < 0.05:
                        state["cpu"] = random.uniform(80, 100)
                        state["ram"] = min(100, state["ram"] + random.uniform(20, 50))
                        state["network_tx"] += random.uniform(50, 200)
                        state["network_rx"] += random.uniform(50, 200)
                    else:
                        state["cpu"] += random.uniform(-5, 4)
                        state["ram"] += random.uniform(-2, 1.5)
                        state["network_tx"] += random.uniform(-5, 5)
                        state["network_rx"] += random.uniform(-5, 5)
                    state["disk_usage"] += random.uniform(-0.1, 0.2)

                state["cpu"] = max(5, min(100, state["cpu"]))
                state["ram"] = max(10, min(100, state["ram"]))
                state["network_tx"] = max(0, state["network_tx"])
                state["network_rx"] = max(0, state["network_rx"])
                state["disk_usage"] = max(10, min(100, state["disk_usage"]))

                # 2. Auto-Thermostat
                apply_thermostat(state)

                # 3. Thermal Physics
                apply_environmental_physics(state)
                
                is_anomaly = detect_anomaly(state)

                payload = {
                    "sensor_id": rack_id,
                    "temperature_c": round(state["temp"], 2),
                    "humidity_percent": round(state["hum"], 2),
                    "cpu_load": round(state["cpu"], 1),
                    "ram_usage": round(state["ram"], 1),
                    "network_tx": round(state["network_tx"], 2),
                    "network_rx": round(state["network_rx"], 2),
                    "disk_usage": round(state["disk_usage"], 1),
                    "ac_on": state["ac_on"],
                    "ml_anomaly": is_anomaly,
                    "timestamp": datetime.now(timezone.utc).isoformat()
                }
                client.publish(TOPIC_ENV, json.dumps(payload))
            time.sleep(2)
    except KeyboardInterrupt:
        logger.info("Simulation stopped.")
    finally:
        client.loop_stop()
        client.disconnect()

if __name__ == "__main__":
    main()
