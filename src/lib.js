
// All of the functions in here require the global |medea| object to be set
// to a valid medea context. To use with multiple contexts, this will
// require refactoring.

// Return the prototype mesh for drawing a terrain surface with VTF-based
// height (i.e the mesh is a flat grid with y==0). This mesh
// is never used for drawing, but tiles use CloneMesh()
// to get independent copies.
var get_prototype_terrain_mesh = medealib.Cached(function() {
	var mesh = medea.CreateFlatTerrainTileMesh(get_prototype_terrain_material(),
		TILE_SIZE,
		TILE_SIZE,
		Math.min(COUNT_LOD_LEVELS, log2(TILE_SIZE)),
		true /* No UVS */);

	// TODO: calculate proper bounding box
	mesh.BB(medea.CreateBB([0, 0, 0], [TILE_SIZE, 255, TILE_SIZE]));
	mesh.LODAttenuationScale(lod_attenuation);
	return mesh;
});

// Return the prototype material for drawing terrain. This material
// is never used for drawing, but terrain tiles use CloneMaterial()
// to get independent copies.
var get_prototype_terrain_material = (function() {
	var terrain_materials = {};
	return function(cube_face_idx) {

	var heightmap_idx = cube_face_idx_to_heightmap_idx(cube_face_idx);

	var key = heightmap_idx;
	if (terrain_materials[key]) {
		return terrain_materials[key];
	}

	var defines = {};
	if (cube_face_idx === DESERT_IDX) {
		defines.DESERT = '';
	}

	var constants = {
		// TERRAIN_SPECULAR
		// spec_color_shininess : [1,1,1,32],
		coarse_normal_texture : 'url:data/textures/heightmap' + heightmap_idx + '-nm_NRM.png',
		fine_normal_texture : 'url:data/textures/heightmap0-nm_NRM_2.jpg',

		ground_texture: 'url:data/textures/terrain_detail_a.jpg',
		ground_normal_texture: 'url:data/textures/terrain_detail_a_NRM.png',

		stone_texture: 'url:data/textures/terrain_detail_b.jpg',
		stone_normal_texture: 'url:data/textures/terrain_detail_b_NRM.png',

		grass_texture: 'url:data/textures/terrain_detail_d.jpg',

		treemap: 'url:data/textures/treemap.png',

		inv_terrain_map_dim: 1.0 / TERRAIN_PLANE_WIDTH,

		// Use a function setter to update tweakables every frame
		lod_attenuation : function() {
			return lod_attenuation;
		},

		// The heightmap needs custom parameters so we need to load it
		// manually (this is no overhead, specifying a URL for a texture
		// constant directly maps to medea.CreateTexture on that URL)
		heightmap : medea.CreateTexture('url:data/textures/heightmap' + heightmap_idx + '.png', null,
			// We don't need MIPs for the heightmap anyway
			medea.TEXTURE_FLAG_NO_MIPS |
			// Hint to medea that the texture will be accessed
			// from within a vertex shader.
			medea.TEXTURE_VERTEX_SHADER_ACCESS |
			medea.TEXTURE_FLAG_CLAMP_TO_EDGE,

			// Only one channel is required
			medea.TEXTURE_FORMAT_LUM),
	};	

	if (cube_face_idx === DESERT_IDX) {
		constants.desert_texture = 'url:data/textures/terrain_detail_e.jpg';
	}
	else {
		constants.snow_texture = 'url:data/textures/terrain_detail_c.jpg';
	}

	var mat = medea.CreateSimpleMaterialFromShaderPair('url:data/shader/terrain', constants, undefined, defines);
	mat.SetIgnoreUniformVarLocationNotFound();
	terrain_materials[key] = mat;

	var state = mat.Pass(0).State();
	state.stencil_func = ['equal', 0x1, 0xff];
	state.stencil_test = true;
	return mat;
	};
})();

// Return the prototype material for drawing water. This material
// is never used for drawing, but water tiles use CloneMaterial()
// to get independent copies.
var get_prototype_water_material = (function() {
	var water_materials = {};
	return function(cube_face_idx) {

	var heightmap_idx = cube_face_idx_to_heightmap_idx(cube_face_idx);

	var key = heightmap_idx;
	if (water_materials[key]) {
		return water_materials[key];
	}
	var water_material = medea.CreateSimpleMaterialFromShaderPair('url:data/shader/water', {
			texture : 'url:/data/textures/water.jpg',
			// Allocate the heightmap again, this time with MIPs as we'll otherwise suffer from aliasing
			heightmap : medea.CreateTexture('url:data/textures/heightmap' + heightmap_idx +'.png', null,
					medea.TEXTURE_FLAG_CLAMP_TO_EDGE,
					// Only one channel is required
					medea.TEXTURE_FORMAT_LUM),
			spec_color_shininess : [0.65, 0.65, 0.7, 16.0],
			inv_terrain_map_dim: 1.0 / TERRAIN_PLANE_WIDTH
		}
	);
	water_material.Pass(0).SetDefaultAlphaBlending();
	water_materials[key] = water_material;
	return water_material;
	};
})();