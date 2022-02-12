const path = require("path");
const fs = require("fs");
const Vec3 = require("tera-vec3");

module.exports = function TeleportLite(mod) {
	let bookmarks = new Map();
	let changeZoneEvent = null;
	let locationEvent = null;
	let lastLocation = null;
	let isDrop = false;
	let curHp = 0;
	let maxHp = 0;

	//
	// GUI
	//

	mod.hook("C_CONFIRM_UPDATE_NOTIFICATION", 1, { "order": 100010 }, () => false);

	mod.hook("C_ADMIN", 1, { "order": 100010, "filter": { "fake": false, "silenced": false, "modified": null } }, event => {
		if (event.command.includes(";")) {
			event.command.split(";").forEach(cmd => {
				try {
					mod.command.exec(cmd);
				} catch (e) {
					return;
				}
			});

			return false;
		}
	});

	function parseGui(array, title) {
		let body = "";

		try {
			array.forEach(data => {
				if (body.length >= 16000)
					throw "GUI data limit exceeded, some values may be missing.";
				if (data.command)
					body += `<a href="admincommand:/@${data.command};">${data.text}</a>`;
				else if (!data.command)
					body += `${data.text}`;
				else
					return;
			});
		} catch (e) {
			body += e;
		}

		mod.send("S_ANNOUNCE_UPDATE_NOTIFICATION", 1, { "id": 0, title, body });
	}

	mod.command.add("tp", {
		"loc": () => {
			mod.command.message(
				`Zone: ${mod.game.me.zone} ` +
				`x: ${Math.round(locationEvent.loc.x)} ` +
				`y: ${Math.round(locationEvent.loc.y)} ` +
				`z: ${Math.round(locationEvent.loc.z)} ` +
				`w: ${locationEvent.w.toFixed(2)}`
			);

			console.log(
				`loc: ${locationEvent.loc.x}, ${locationEvent.loc.y}, ${locationEvent.loc.z}`, "|",
				`w: ${locationEvent.w} (${180 * locationEvent.w / Math.PI})`);
		},
		"drop": percent => {
			if (!percent || isDrop) return;

			percent = (parseInt(curHp) * 100 / parseInt(maxHp)) - Number(percent);

			if (percent <= 0) {
				return mod.command.message("Cannot drop to a value above or equal to your current HP.");
			}

			dropHp(percent);
		},
		"to": name => {
			loadZone(mod.game.me.zone);

			if (name) {
				if (!bookmarks.has(name)) {
					return mod.command.message(`Cannot found bookmark: ${name}, zone: ${mod.game.me.zone}`);
				}

				const loc = bookmarks.get(name);

				teleportInstant(loc.x, loc.y, loc.z, loc.w, mod.game.me.zone);
			} else {
				teleportList();
			}
		},
		"save": (name, zOffset = 0) => {
			const z = zOffset ? locationEvent.loc.z + Number(zOffset) : locationEvent.loc.z;

			if (name) {
				bookmarks.set(name, {
					"x": locationEvent.loc.x,
					"y": locationEvent.loc.y,
					"z": z,
					"w": locationEvent.w
				});

				saveBookmarks();
			}

			mod.command.message(
				`Location is saved: ${name}. Zone: ${mod.game.me.zone}, ` +
				`x: ${Math.round(locationEvent.loc.x)}, ` +
				`y: ${Math.round(locationEvent.loc.y)}, ` +
				`z: ${Math.round(z)}, w: ${locationEvent.w.toFixed(2)}]`
			);
		},
		"remove": name => {
			if (name) {
				if (!bookmarks.has(name)) {
					mod.command.message(`Cannot found bookmark: ${name}, zone: ${mod.game.me.zone}`);
				} else {
					bookmarks.delete(name);
					mod.command.message(`Bookmark has removed: ${name}, zone: ${mod.game.me.zone}`);

					saveBookmarks();
				}
			}
		},
		"guiremove": (name, action) => {
			if (name) {
				if (!bookmarks.has(name)) {
					mod.command.message(`Cannot found bookmark: ${name}, zone: ${mod.game.me.zone}`);
				} else if (action === "yes") {
					bookmarks.delete(name);
					mod.command.message(`Bookmark has removed: ${name}, zone: ${mod.game.me.zone}`);

					saveBookmarks();

					if (bookmarks.size !== 0) {
						teleportList();
					}
				} else if (action === "no") {
					teleportList();
				} else {
					const tmpData = [
						{ "text": `<font color="#cccccc" size="+24">Do you want to remove bookmark &quot;${name}&quot; from zone ${mod.game.me.zone}?</font><br><br>` },
						{ "text": "<font color=\"#fe6f5e\" size=\"+24\">[Yes]</font>", "command": `tp guiremove '${name}' yes` },
						{ "text": "&nbsp;".repeat(4) },
						{ "text": "<font color=\"#4de19c\" size=\"+24\">[No]</font>", "command": `tp guiremove '${name}' no` }
					];

					parseGui(tmpData, "<font color=\"#e0b0ff\">Confirm Deletion</font>");
				}
			}
		},
		"blink": (distacne, zOffset) => blink(distacne ? Number(distacne) : 50, zOffset ? Number(zOffset) : 0),
		"back": () => {
			if (lastLocation) {
				teleportInstant(lastLocation.loc.x, lastLocation.loc.y, lastLocation.loc.z, lastLocation.w);
			} else {
				mod.command.message("No last point saved!");
			}
		},
		"up": zOffset => {
			if (zOffset) {
				teleportInstant(locationEvent.loc.x, locationEvent.loc.y, locationEvent.loc.z + Number(zOffset));
			}
		},
		"down": zOffset => {
			if (zOffset) {
				teleportInstant(locationEvent.loc.x, locationEvent.loc.y, locationEvent.loc.z - Number(zOffset));
			}
		},
		"x": (oper, xOffset) => {
			if (xOffset) {
				switch (oper) {
					case "+":
						teleportInstant(locationEvent.loc.x + Number(xOffset), locationEvent.loc.y, locationEvent.loc.z);
						break;
					case "-":
						teleportInstant(locationEvent.loc.x - Number(xOffset), locationEvent.loc.y, locationEvent.loc.z);
						break;
				}
			}
		},
		"y": (oper, yOffset) => {
			if (yOffset) {
				switch (oper) {
					case "+":
						teleportInstant(locationEvent.loc.x, locationEvent.loc.y + Number(yOffset), locationEvent.loc.z);
						break;
					case "-":
						teleportInstant(locationEvent.loc.x, locationEvent.loc.y - Number(yOffset), locationEvent.loc.z);
						break;
				}
			}
		},
		"z": (oper, zOffset) => {
			if (zOffset) {
				switch (oper) {
					case "+":
						teleportInstant(locationEvent.loc.x, locationEvent.loc.y, locationEvent.loc.z + Number(zOffset));
						break;
					case "-":
						teleportInstant(locationEvent.loc.x, locationEvent.loc.y, locationEvent.loc.z - Number(zOffset));
						break;
				}
			}
		},
		"$default": (x, y, z) => {
			if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
				teleportInstant(x, y, z);
			}
		}
	});

	//
	// HOOKS
	//

	mod.game.me.on("change_zone", changeZoneEvent = zone => {
		loadZone(zone);
	});

	mod.hook("S_EXIT", 3, event => {
		if (event.code === 16) return false;
	});

	mod.hook("S_PLAYER_STAT_UPDATE", mod.majorPatchVersion === 92 ? 13 : 17, e => {
		curHp = e.hp;
		maxHp = e.maxHp;
	});

	mod.hook("S_CREATURE_CHANGE_HP", 6, e => {
		if (e.target !== mod.game.me.gameId) return;

		curHp = e.curHp;
		maxHp = e.maxHp;
	});

	mod.hook("C_PLAYER_LOCATION", 5, event => {
		locationEvent = event;

		if (!isDrop && (event.type === 2 || event.type === 10)) return false;
	});

	//
	// FUNCTIONS
	//

	function dropHp(percent) {
		if (!locationEvent) return;

		isDrop = true;
		mod.send("C_PLAYER_LOCATION", 5, { ...locationEvent, "loc": locationEvent.loc.addN({ "z": 400 + percent * (mod.game.me.race === "castanic" ? 20 : 10) }), "type": 2 });
		mod.send("C_PLAYER_LOCATION", 5, Object.assign(locationEvent, { "type": 7 }));
		isDrop = false;
	}

	function blink(distacne, zOffset) {
		teleportInstant(
			(Math.cos(locationEvent.w) * distacne) + locationEvent.loc.x,
			(Math.sin(locationEvent.w) * distacne) + locationEvent.loc.y,
			locationEvent.loc.z + zOffset,
			locationEvent.w
		);
	}

	function teleportInstant(x, y, z, w = null) {
		if (!locationEvent) return;

		mod.send("S_INSTANT_MOVE", 3, {
			"gameId": mod.game.me.gameId,
			"loc": new Vec3(x, y, z),
			"w": w || locationEvent.w
		});

		lastLocation = {
			"loc": locationEvent.loc,
			"w": locationEvent.w
		};
	}

	function teleportList() {
		if (bookmarks.size === 0) return;

		const tempData = [
			{ "text": "&nbsp;".repeat(180) },
			{ "text": "<font color=\"#9966cc\" size=\"+24\">[refresh]</font>", "command": "tp to" },
			{ "text": "<font size=\"+4\"><br></font>" }
		];

		bookmarks.forEach((bookmarkData, bookmarkName) => {
			tempData.push(
				{ "text": "&nbsp;".repeat(2) },
				{ "text": "<font color=\"#fe6f5e\" size=\"+18\">[x]</font>", "command": `tp guiremove '${bookmarkName}'` },
				{ "text": "&nbsp;".repeat(6) },
				{ "text": `<font color="#4de19c" size="+38">${bookmarkName}</font><br>`, "command": `tp to '${bookmarkName}'` }
			);
		});

		parseGui(tempData, `<font color="#e0b0ff">${"Teleport List"} [${mod.game.me.zone}]</font>`);
	}

	//
	// BOOKMARKS
	//

	function readBookmarks(id) {
		try {
			delete require.cache[require.resolve(path.join(__dirname, "bookmark", `${id}.json`))];
			return new Map(Object.entries(require(path.join(__dirname, "bookmark", `${id}.json`))));
		} catch (err) {
			return null;
		}
	}

	function loadZone(zone) {
		const bookmarksData = readBookmarks(zone);

		if (bookmarksData) {
			bookmarks = bookmarksData;
		} else {
			bookmarks = new Map();
		}
	}

	function saveBookmarks() {
		if (!fs.existsSync(path.join(__dirname, "bookmark"))) {
			fs.mkdirSync(path.join(__dirname, "bookmark"));
		}

		fs.writeFileSync(path.join(__dirname, "bookmark", `${mod.game.me.zone}.json`), JSON.stringify(Object.fromEntries(bookmarks), null, 2));
	}

	//
	// RELOADING
	//

	this.saveState = () => ({
		bookmarks
	});

	this.loadState = state => {
		bookmarks = state.bookmarks;
	};

	this.destructor = () => {
		if (changeZoneEvent) {
			mod.game.me.off("change_zone", changeZoneEvent);
		}

		mod.command.remove("tp");
	};
};