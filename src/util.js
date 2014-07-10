// Utility functions independent of medea or other app state


function lerp(a, b, f) {
	return a + (b - a) * f;
}

function log2(x) {
	return Math.log(x) / Math.log(2.0);
}

function saturate(x) {
	return Math.min(1.0, Math.max(0.0, x));
}

var DESERT_IDX = 1;

// For a given face of the terrain cube, get the source heightmap index to use.
//
// This mapping is necessary since four of the faces share a heightmap.
function cube_face_idx_to_heightmap_idx(cube_face_idx) {
	return cube_face_idx == DESERT_IDX ? 1 : 0;
}


