

 
#include <remote:mcore/shaders/core.vsh>

void main()
{
	PassClipPosition(ModelToClipSpace(FetchPosition()));

	vec3 world_position = ModelToWorldSpace(FetchPosition());
	PassNormal(normalize(world_position));
	PassTexCoord(FetchTexCoord());
}

