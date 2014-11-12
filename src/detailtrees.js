
function InitDetailTreeNodeType(medea, app) {

	// Load both detail tree meshes asynchronously
	var loaded_tree = false;
	var tree_prototype = medea.CreateNode();
	medea.LoadSceneFromResource('url:data/meshes/tree5.json', tree_prototype, null, function(st) {
		if (st == medea.SCENE_LOAD_STATUS_GEOMETRY_FINISHED) {
			tree_prototype.Scale(0.15);
			// TODO: actually center trees properly
			tree_prototype.Translate([0, -0.3, 0]);

			tree_prototype.FilterEntitiesRecursively([medea.Mesh], function(m) {
				var pass = m.Material().Pass(0);
				pass.SetDefaultAlphaBlending();
				pass.DepthTest(true);
				pass.DepthWrite(true);
				m.RenderQueue(medea.RENDERQUEUE_ALPHA);
			});

			loaded_tree = true;
		}
	}); 

	var loaded_pine = false;
	var pine_prototype = medea.CreateNode();
	medea.LoadSceneFromResource('url:data/meshes/pine.json', pine_prototype, null, function(st) {
		if (st == medea.SCENE_LOAD_STATUS_GEOMETRY_FINISHED) {
			pine_prototype.Scale(0.04);
			// TODO: actually center trees properly
			pine_prototype.Translate([0, -0.3, 0]);

			pine_prototype.FilterEntitiesRecursively([medea.Mesh], function(m) {
				var pass = m.Material().Pass(0);
				pass.SetDefaultAlphaBlending();
				pass.DepthTest(true);
				pass.DepthWrite(true);
				m.RenderQueue(medea.RENDERQUEUE_ALPHA);
			});

			loaded_pine = true;
		}
	}); 

	var scratch = vec3.create();
	var scratch_mat = mat4.create();

	var north = vec3.create([0, RADIUS, 0]);

	var DETAIL_TREE_UPDATE_THRESHOLD_SQ = DETAIL_TREE_UPDATE_THRESHOLD * DETAIL_TREE_UPDATE_THRESHOLD;

	var DetailTreeNode = medea.Node.extend({
		x : 0,
		y : 0,
		w : 1,

		mesh : null,
		last_update_cam_world_pos : null,

		init : function(x, y, w, cube_face_idx) {
			this._super();
			this.x = x | 0;
			this.y = y | 0;
			this.w = w === undefined ? 1 : w;
			
			this.SetStaticBB(medea.BB_INFINITE);
		},

		Render : function(camera, rqmanager) {
			this._super();

			if (!loaded_tree || !loaded_pine) {
				return;
			}

			var cam_world_pos = camera.GetWorldPos();

			// Check if the camera moved more than the threshold distance since the last update
			vec3.subtract(cam_world_pos, this.last_update_cam_world_pos || [0, 0, 0], scratch);
			if (vec3.dot(scratch, scratch) < DETAIL_TREE_UPDATE_THRESHOLD_SQ) {
				return;
			}

			// If so, discard all children and re-attach all active detail trees
			this.last_update_cam_world_pos = cam_world_pos;
			this.RemoveAllChildren();

			var tree_radius = TREE_BILLBOARD_FADE_END * 1.2;
			var tree_radius_sq = tree_radius * tree_radius;

			var trees = app.GetTerrainNode().GetTreesInRadius(cam_world_pos, tree_radius);
			for (var i = 0; i < trees.length; ++i) {
				var tree_pos = trees[i];

				vec3.subtract(cam_world_pos, tree_pos, scratch);
				if (vec3.dot(scratch, scratch) > tree_radius_sq) {
					continue;
				}

				var tree_node = medea.CreateNode();
				
				// Derive a stable coordinate system based on the position of the tree on the sphere,
				// adding high-frequency noise to have trees appear locally random.
				var noise = string_hash(tree_pos[0].toString() + tree_pos[1].toString()) & 2047;
				// TODO: calculation is undefined at the north pole

				var orientation = mat4.identity(scratch_mat);
				var up = vec3.create(tree_pos);
				vec3.normalize(up, up);

				var forward = vec3.create();
				var right = vec3.create();
			
				vec3.subtract(north, tree_pos, forward);
				forward[0] += noise;
				forward[1] -= noise;

				// Normalize upfront to keep magnitude of numbers low
				vec3.normalize(forward);

				vec3.cross(forward, up, right);
				vec3.cross(right, up, forward);

				vec3.normalize(right);
				vec3.normalize(forward);

				// z (forward) axis
				orientation[8]  = forward[0];
				orientation[9]  = forward[1];
				orientation[10] = forward[2];

				// x (right) axis
				orientation[0]  = right[0];
				orientation[1]  = right[1];
				orientation[2]  = right[2];

				// y (up) axis
				orientation[4]  = up[0];
				orientation[5]  = up[1];
				orientation[6]  = up[2];

				// translation
				orientation[12] = tree_pos[0];
				orientation[13] = tree_pos[1];
				orientation[14] = tree_pos[2];

				tree_node.LocalTransform(orientation);

				var tree_scene_node = medea.CloneNode(noise > 1024 ? tree_prototype : pine_prototype);
				tree_scene_node.Scale(1.0 + (noise & 15) / 32.0);

				// Add a shallow clone of the prototype node holding the tree mesh.
				// This re-creates the node hierarchy, but uses the same entities.
				tree_node.AddChild(tree_scene_node);
				this.AddChild(tree_node);
			}
		},
	});

	return DetailTreeNode;
}
