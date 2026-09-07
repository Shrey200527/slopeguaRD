# SlopeGuard Data Contract

## Zone

zone_id
name
latitude
longitude
slope
elevation
historical_risk

## Sensor Reading

node_id
zone_id
timestamp
rainfall
soil_moisture
tilt

## Risk Prediction

zone_id
timestamp
risk_score
risk_level
confidence
drivers

## Field Report

report_id
zone_id
timestamp
latitude
longitude
type
description
image
status

## Priority

zone_id
priority_score
risk
exposure
urgency
recommended_action