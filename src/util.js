// Utility functions independent of medea or other app state


function lerp(a, b, f) {
	return a + (b - a) * f;
}

function log2(x) {
	return Math.log(x) / Math.log(2.0);
}


///////////////////////////////////////////////////////////////////////////
// Given an approximate |sq_distance| of an object, determine the
// continuous LOD (CLOD) value for it. CLOD is in [0, COUNT_LOD_LEVELS[
//
// Must keep in sync with terrain.vs
function calc_clod(sq_distance) {
	var log_distance = log2(sq_distance / (64.0 * 64.0)) * 0.5 * lod_attenuation;
	return clamp(0, COUNT_LOD_LEVELS - 1, log_distance);
}


///////////////////////////////////////////////////////////////////////////
// Clamp |x| to [xmin, xmax]
function clamp(xmin, xmax, x) {
	return Math.min(xmax, Math.max(xmin, x));
}


///////////////////////////////////////////////////////////////////////////
// Clamp |x| to [0, 1]
function saturate(x) {
	return Math.min(1.0, Math.max(0.0, x));
}


/////////////////////////////////////////////////////////////////////////////
//http://werxltd.com/wp/2010/05/13/javascript-implementation-of-javas-string-hashcode-method/
function string_hash(s) {
	var hash = 0;
	if (s.length == 0) return hash;
	for (i = 0; i < s.length; i++) {
		char = s.charCodeAt(i);
		hash = ((hash<<5)-hash)+char;
		hash = hash & hash; // Convert to 32bit integer
	}
	return hash;
}


///////////////////////////////////////////////////////////////////////////
// Transform a 3D vector |src| by |mat|, treating the homogenous coordinate
// as 0, i.e. not applying translation. Write result to |dest|, which
// defaults to |src|.
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


///////////////////////////////////////////////////////////////////////////
// Given samples |p0|, |p1|, |p2|, |p3| compute value at |x| by cubic interpolation
// http://www.paulinternet.nl/?page=bicubic
function cubic_interp_1d(p0, p1, p2, p3, x) {
	// Horner-scheme like separation of coefficients to save multiplications
	return p1 + 0.5 * x*(p2 - p0 + x*(2.0*p0 - 5.0*p1 + 4.0*p2 - 
		p3 + x*(3.0*(p1 - p2) + p3 - p0)));
}


///////////////////////////////////////////////////////////////////////////
// Given a line |p0| + x * (|p1| - |p0|), find the u for which the line is
// closest to a given point |p|. If |p| is approximately on the line, |null|
// is returned.
//
// http://portal.ku.edu.tr/~cbasdogan/Courses/Robotics/projects/IntersectionLineSphere.pdf
function find_closest_point(p0, p1, p) {
	var d0 = p1[0] - p0[0];
	var d1 = p1[1] - p0[1];
	var d2 = p1[2] - p0[2];
	var denom = d0 * d0 + d1 * d1 + d2 * d2;
	if (denom < 0.0001) {
		return null;
	}
	var n0 = p[0] - p0[0];
	var n1 = p[1] - p0[1];
	var n2 = p[2] - p0[2];
	var nom = n0 * d0 + n1 * d1 + n2 * d2;
	return nom / denom;
}


var DESERT_IDX = 1;

///////////////////////////////////////////////////////////////////////////
// For a given face of the terrain cube, get the source heightmap index to use.
//
// This mapping is necessary since four of the faces share a heightmap.
function cube_face_idx_to_heightmap_idx(cube_face_idx) {
	return cube_face_idx == DESERT_IDX ? 1 : 0;
}


