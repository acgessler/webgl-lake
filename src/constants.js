

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
var OUTER_RADIUS = RADIUS_GROUND * 1.018;
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

var ORBIT_CAM_BLEND_TO_FPS_START_HEIGHT = 200;
var FPS_HEIGHT_OVER_GROUND = 3;


var GRASS_NODES_PER_AXIS = 64;
var GRASS_BLADES_PER_NODE = 3;
var GRASS_BLADE_HEIGHT = 0.7;
var GRASS_BLADE_WIDTH = 2.0;

// Distance range within which to display tree billboards
var TREE_BILLBOARD_FADE_BEGIN = TILE_SIZE * 0.5;
var TREE_BILLBOARD_FADE_END = TREE_BILLBOARD_FADE_BEGIN * 1.2;

var DETAIL_TREE_UPDATE_THRESHOLD = (TREE_BILLBOARD_FADE_END - TREE_BILLBOARD_FADE_BEGIN) / 2;

var GRAS_FADE_BEGIN = 20.0;
var GRAS_FADE_END = 30.0;
