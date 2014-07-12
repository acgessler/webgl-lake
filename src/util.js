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

var transform_vector = (function() {
	var v4 = [0.0, 0.0, 0.0, 0.0];
	return function(mat, src, dest) {
		v4[0] = src[0];
		v4[1] = src[1];
		v4[2] = src[2];
		v4[3] = 0.0;
		mat4.multiplyVec4(mat, v4);

		if (!dest) {
			dest = src;
		}
		vec3.set(v4, dest);
	};
})();

// Given samples |p0|, |p1|, |p2|, |p3| compute value at |x| by cubic interpolation
// http://www.paulinternet.nl/?page=bicubic
function cubic_interp_1d(p0, p1, p2, p3, x) {
	// Horner-scheme like separation of coefficients to save multiplications
	return p1 + 0.5 * x*(p2 - p0 + x*(2.0*p0 - 5.0*p1 + 4.0*p2 - p3 + x*(3.0*(p1 - p2) + p3 - p0)));
}

var DESERT_IDX = 1;

// For a given face of the terrain cube, get the source heightmap index to use.
//
// This mapping is necessary since four of the faces share a heightmap.
function cube_face_idx_to_heightmap_idx(cube_face_idx) {
	return cube_face_idx == DESERT_IDX ? 1 : 0;
}


