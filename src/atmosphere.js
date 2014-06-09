var InitAtmosphereNodeType = function(medea) {
	// Leaf that actually draws a terrain tile (of any power-of-two size)
	// Could be part of TerrainQuadTreeNode, but factored out to keep things easy.
	var AtmosphereNode = medea.Node.extend({
	});

	return AtmosphereNode;
};