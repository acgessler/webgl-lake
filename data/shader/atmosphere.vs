
/* medea.js - Open Source, High-Performance 3D Engine based on WebGL.
 *
 * (c) 2011-2013, Alexander C. Gessler
 *  https://github.com/acgessler/medea.js
 *
 * Made available under the terms and conditions of a 3-clause BSD license.
 *
 */
 
#include <remote:mcore/shaders/core.vsh>
#include <url:/data/shader/constants_shared.vsh>

// Original (c) is Sean O'Neill, 2004

uniform vec3 CAM_POS;
uniform vec3 LIGHT_D0_DIR;		
uniform vec3 v3InvWavelength;	
uniform float fCameraHeight;	
uniform float fCameraHeight2;	
uniform float fOuterRadius;		
uniform float fOuterRadius2;	
uniform float fInnerRadius;		
uniform float fInnerRadius2;	
uniform float fKrESun;			
uniform float fKmESun;			
uniform float fKr4PI;			
uniform float fKm4PI;		
uniform float fScale;			
uniform float fScaleDepth;		
uniform float fScaleOverScaleDepth;

const int nSamples = 4;
const float fSamples = 4.0;

#ifdef SKY
#undef CAMERA_IN_SPACE
#endif

float scale(float fCos)
{
	float x = 1.0 - fCos;
	return fScaleDepth * exp(-0.00287 + x*(0.459 + x*(3.83 + x*(-6.80 + x*5.25))));
}

// Returns the near intersection point of a line and a sphere
float getNearIntersection(vec3 v3Pos, vec3 v3Ray, float fDistance2, float fRadius2)
{
   float B = 2.0 * dot(v3Pos, v3Ray);
   float C = fDistance2 - fRadius2;
   float fDet = max(0.0, B*B - 4.0 * C);
   return 0.5 * (-B - sqrt(fDet));
}

void main()
{
	vec3 v3Pos = ModelToWorldSpace(FetchPosition());

	vec3 v3Ray = v3Pos - CAM_POS;
	float fFar = length(v3Ray);
	v3Ray /= fFar;

#ifdef CAMERA_IN_SPACE
	float fNear = getNearIntersection(CAM_POS, v3Ray, fCameraHeight2,
                                    fOuterRadius2);
	vec3 v3Start = CAM_POS + v3Ray * fNear;
	fFar -= fNear;

#ifdef SKY

  	float fStartAngle = dot(v3Ray, v3Start) / fOuterRadius;
  	float fStartDepth = exp(-1.0 / fScaleDepth);
  	float fStartOffset = fStartDepth * scale(fStartAngle);

#else

	float fDepth = exp((fInnerRadius - fOuterRadius) / fScaleDepth);
	vec3 v3PosNorm = normalize(v3Pos);
	float fCameraAngle = dot(-v3Ray, v3PosNorm);
	float fLightAngle = dot(LIGHT_D0_DIR, v3PosNorm);
	float fCameraScale = scale(fCameraAngle);
	float fLightScale = scale(fLightAngle);
	float fCameraOffset = fDepth * fCameraScale;
	float fTemp = (fLightScale + fCameraScale);

#endif
	// ..
#else

	vec3 v3Start = CAM_POS;
	float fHeight = length(v3Start);
	float fDepth = exp(fScaleOverScaleDepth * (fInnerRadius - fCameraHeight));
	float fStartAngle = dot(v3Ray, v3Start) / fHeight;
	float fStartOffset = fDepth * scale(fStartAngle);

#endif

	float fSampleLength = fFar / fSamples;
	float fScaledLength = fSampleLength * fScale;
	vec3 v3SampleRay = v3Ray * fSampleLength;
	vec3 v3SamplePoint = v3Start + v3SampleRay * 0.5;
	vec3 v3ScatterScale = v3InvWavelength * fKr4PI + fKm4PI;

	vec3 v3FrontColor = vec3(0.0, 0.0, 0.0);
	vec3 v3Attenuate;
	for(int i = 0; i < nSamples; i++)
	{
		float fHeight = length(v3SamplePoint);
		float fDepth = exp(fScaleOverScaleDepth * (fInnerRadius - fHeight));
#ifdef SKY
		vec3 v3SamplePointNorm = v3SamplePoint / fHeight;
		float fLightAngle = dot(LIGHT_D0_DIR, v3SamplePointNorm);
		float fCameraAngle = dot(v3Ray, v3SamplePointNorm);
		float fScatter = fStartOffset + fDepth*(scale(fLightAngle) - scale(fCameraAngle));
#else	
		float fScatter = fDepth * fTemp - fCameraOffset;
#endif
		v3Attenuate = exp(-fScatter * v3ScatterScale);
		v3FrontColor += v3Attenuate * fDepth;
		v3SamplePoint += v3SampleRay;
	}

	v3FrontColor *= fScaledLength;

#ifdef SKY
	PassVec3(color_b, v3FrontColor * fKmESun);
	PassVec3(color_a, v3FrontColor * (v3InvWavelength * fKrESun));
#else
	PassVec3(color_b,v3FrontColor * (v3InvWavelength * fKrESun + fKmESun));
	PassVec3(color_a, v3Attenuate);
#endif

	PassClipPosition(ModelToClipSpace(FetchPosition()));
	PassVec3(direction, CAM_POS - v3Pos);
}

