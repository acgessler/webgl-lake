
/* medea.js - Open Source, High-Performance 3D Engine based on WebGL.
 *
 * (c) 2011-2013, Alexander C. Gessler
 *  https://github.com/acgessler/medea.js
 *
 * Made available under the terms and conditions of a 3-clause BSD license.
 *
 */
 
#include <remote:mcore/shaders/core.vsh>
#include <url:/data/shader/terrain_shared.vsh>
#include <url:/data/shader/sphere_shared.vsh>
#include <url:/data/shader/constants_shared.vsh>

uniform float zfighting_avoidance_factor;
uniform vec3 CAM_POS;

// Currently all lighting computation happens in worldspace
void main()
{
	vec3 position = FetchPosition();
	position.y = kWATER_LEVEL;
	vec2 uv = TilePositionToTerrainUVCoordinates(position.xz);

	vec3 sphere_world_position = ProjectOntoSphere(position);
	vec3 eye = CAM_POS - sphere_world_position;

	// To avoid any z-fighting between the water and the terrain, move the
	// water plane up as the camera goes farther away. The pixel shader
	// then clips against the sampled height to make sure the water
	// boundary is correct.
	//
	// At a ground level, the natural intersection of the water plane
	// with the terrain looks more natural than the clipped boundary.
	sphere_world_position += sphere_world_position * zfighting_avoidance_factor;

	PassClipPosition(WorldToClipSpace(sphere_world_position));
	PassNormal(normalize(sphere_world_position));
	PassTexCoord(uv);

	PassVec3(eye, eye);
}

