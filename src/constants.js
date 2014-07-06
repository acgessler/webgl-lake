

// The following parameters need to be synced with constants_shared.vsh
// Technically most of them could be made uniforms and passed to
// shaders at runtime, but it significantly decreases shader
// performance and comes at higher CPU overhead.
var COUNT_LOD_LEVELS = 9;
var TILE_SIZE = 64;
var TERRAIN_PLANE_WIDTH = 2048;
var TILE_COUNT = TERRAIN_PLANE_WIDTH / TILE_SIZE;
var TERRAIN_PLANE_OFFSET = -TERRAIN_PLANE_WIDTH / 2;
var RADIUS = 1024;
var RADIUS_GROUND = RADIUS + 60;
var OUTER_RADIUS = RADIUS_GROUND * 1.020;
var TERRAIN_STENCIL_CLIP_RADIUS = RADIUS_GROUND;
var CLOUDS_RADIUS = RADIUS_GROUND + (OUTER_RADIUS - RADIUS_GROUND) * 0.2;
var TREE_MAP_WIDTH = 512; // terrain % trees == 0

// Tree billboard height over width
var TREE_WIDTH = 2.6;
var TREE_ASPECT = 2.3;

var TERRAIN_HEIGHT_SCALE = 0.55;

var INITIAL_CAM_PHI = 3.0;
var INITIAL_CAM_THETA = 1.5;
var CAM_SMOOTH_SPEED = 0.7;
var MAX_ORBIT_CAM_DISTANCE = RADIUS * 12;
var INITIAL_ORBIT_CAM_DISTANCE = RADIUS * 11;
var SUN_DISTANCE = MAX_ORBIT_CAM_DISTANCE * 1.01;
var SUN_SIZE = 0.05;