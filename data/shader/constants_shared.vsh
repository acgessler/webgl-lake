#ifndef INCLUDED_CONSTANTS_SHARED
#define INCLUDED_CONSTANTS_SHARED

const float kTILE_SIZE = 64.0;
const float kINV_TILE_SIZE = 1.0 / kTILE_SIZE;

const float kRADIUS = 1024.0;
const float kTERRAIN_HEIGHT_SCALE = 0.55;

const float kWATER_LEVEL = 31.04;
const float kHEIGHT_WATER_LEVEL = (kWATER_LEVEL / kTERRAIN_HEIGHT_SCALE) / 255.0;

const float kALL_SNOW_HEIGHT = 0.60;
const float kSNOW_BEGIN = 0.3;

// Distance range within which to display tree billboards
const float kTREE_BILLBOARD_BEGIN = kRADIUS;
const float kTREE_BILLBOARD_END = kTILE_SIZE;

#endif
