

// The following parameters need to be synced with constants_shared.vsh
// Technically most of them could be made uniforms and passed to
// shaders at runtime, but it significantly decreases shader
// performance and comes at higher CPU overhead.
var COUNT_LOD_LEVELS = 9;
var TILE_SIZE = 64;
var TERRAIN_PLANE_WIDTH = 2048;
var TERRAIN_PLANE_OFFSET = -TERRAIN_PLANE_WIDTH / 2;
var RADIUS = 1024;
var TREE_MAP_WIDTH = 512; // terrain % trees == 0

// Tree billboard height over width
var TREE_WIDTH = 2.6;
var TREE_ASPECT = 2.3;

var TERRAIN_HEIGHT_SCALE = 0.55;