var InitStarsNodeType = function(medea, app) {
	// Draws the "milky way" background and stars (TODO)
	var StarsNode = medea.Node.extend({
		init : function() {
			this._super();

			this.dome_node = medea.CreateSkyboxNode('url:data/textures/skybox.png');
			this.AddChild(this.dome_node);

			this.EnabledIf(function() {
				return true;
			});
		}
	});

	return StarsNode;
}

