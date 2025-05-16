CREATE TABLE IF NOT EXISTS cinemas (
    id |(integer) DEFAULT |
,
    name |(text) DEFAULT |
,
    address |(text) DEFAULT |
,
    latitude |(double) DEFAULT precision
,
    longitude |(double) DEFAULT precision
,
    source |(text) DEFAULT |
,
    external_id |(text) DEFAULT |
,
    created_at |(timestamp) DEFAULT without
,
    updated_at |(timestamp) DEFAULT without
,
    city |(text) DEFAULT |
,
    district |(text) DEFAULT |
,
    type |(text) DEFAULT |
,
    PRIMARY KEY (id)
);
