
// Global medea instance
var medea = null;
var viewport = null;
var root = null;

function on_init_error() {
	console.log("Failed to initialize");
}

function on_tick(dtime) {
	return true;
}

function on_init_context() {
	console.log("Context created, setting up scene");
	viewport = medea.CreateViewport();
	viewport.ClearColor([1.0,0.0,1.0]);
	//viewport.Enable(true);

    root = medea.RootNode();
	medea.LoadModules(['terraintile'], function() {
		medea.CreateTerrainTileMesh('remote:terraintile_sample/heightmap_257.png',
			medea.CreateSimpleMaterialFromColor([0.8,0.8,0.8,1.0], true),
			function(mesh) {
				root.AddChild().Translate([-64,10,-64]).AddEntity(mesh);
			}
		);
	});

	// Add the skydome, as in the previous sample
	medea.LoadModules('skydome',function() {
		root.AddChild(medea.CreateSkydomeNode('remote:skydome_sample/midmorning/midmorning.png', 0.4));
    });

	
	// And a plain camera controller
	medea.LoadModules('camcontroller',function() {
		var cam = medea.CreateCameraNode();
		root.AddChild(cam);
		viewport.Camera(cam);
		
		cam.Translate(vec3.create([0,25,5]));
		var cc = medea.CreateCamController('fps');
        cam.AddEntity(cc);
		cc.Enable();
	});

	medea.SetTickCallback(function(dtime) {
		on_tick(dtime);
		return true;
	});	

	medea.SetDebugPanel(null);
    
    console.log("Starting main loop");
	medea.Start();
}

function run() {
	var deps = ['input', 'material', 'standardmesh', 'forwardrenderer', 'light', 'debug'];
	medealib.CreateContext('game_container', {dataroot: '../medea/data'}, deps, function(_medea) {
		
		// We only create one medea instance so make it global
		medea = _medea;
		on_init_context();

	}, on_init_error);
}
