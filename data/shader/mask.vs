


#include <remote:mcore/shaders/core.vsh>

void main()
{
	PassClipPosition(ModelToClipSpace(FetchPosition()));
}

