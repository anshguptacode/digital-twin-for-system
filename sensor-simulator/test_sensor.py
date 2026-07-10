import pytest
from sensor import apply_thermostat, apply_environmental_physics

def test_apply_thermostat_turn_on():
    state = {"temp": 28.0, "ac_on": False}
    apply_thermostat(state)
    assert state["ac_on"] is True

def test_apply_thermostat_turn_off():
    state = {"temp": 20.0, "ac_on": True}
    apply_thermostat(state)
    assert state["ac_on"] is False

def test_apply_thermostat_no_change():
    state = {"temp": 25.0, "ac_on": False}
    apply_thermostat(state)
    assert state["ac_on"] is False

def test_apply_environmental_physics_cooling():
    state = {"temp": 25.0, "hum": 50.0, "cpu": 50, "ac_on": True}
    apply_environmental_physics(state)
    assert state["temp"] < 25.0
    assert state["hum"] < 50.0

def test_apply_environmental_physics_heating():
    state = {"temp": 25.0, "hum": 50.0, "cpu": 100, "ac_on": False}
    apply_environmental_physics(state)
    assert state["temp"] > 25.0
