
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

uniform vec3 CAM_POS;

// Currently all lighting computation happens in worldspace
void main()
{
	vec3 position = FetchPosition();
	position.y = kWATER_LEVEL;
	vec2 uv = TilePositionToTerrainUVCoordinates(position.xz);

	vec3 sphere_world_position = ProjectOntoSphere(position);
	PassClipPosition(WorldToClipSpace(sphere_world_position));
	PassNormal(normalize(sphere_world_position));
	PassTexCoord(uv);

	PassVec3(eye, CAM_POS - sphere_world_position);
}

