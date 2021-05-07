module.exports = function Teleport(mod) {
	const cmd = mod.command || mod.require.command,
		map = new WeakMap(),
		path = jsonRequire("path"),
		fs = jsonRequire("fs");

	let gameId = null,
		isCastanic = false,
		isDrop = false,
		curHp = 0,
		maxHp = 0,
		tLoc = 0,
		wLoc = 0,
		aLoc = null,
		aZone = 0,
		aBook = {};

	if (!map.has(mod.dispatch || mod)) {
		map.set(mod.dispatch || mod, {});
		mod.hook("C_CONFIRM_UPDATE_NOTIFICATION", "raw", () => false);
		mod.hook("C_ADMIN", 1, e => {
			e.command.split(";").forEach(s => mod.command.exec(s));
			return false;
		});
	}

	const gui = {
		parse(array, title, d = "") {
			for (let i = 0; i < array.length; i++) {
				if (d.length >= 16000) {
					d += "Gui data limit exceeded, some values may be missing.";
					break;
				}
				if (array[i].command) d += `<a href="admincommand:/@${array[i].command}">${array[i].text}</a>`;
				else if (!array[i].command) d += `${array[i].text}`;
				else continue;
			}
			mod.toClient("S_ANNOUNCE_UPDATE_NOTIFICATION", 1, {
				"id": 0,
				"title": title,
				"body": d
			});
		}
	};

	cmd.add("tp", (arg1, arg2, arg3) => {
		if (arg1 && arg1.length > 0) arg1 = arg1.toLowerCase();
		if (arg2 && arg2.length > 0) arg2 = arg2.toLowerCase();
		if (arg3 && arg3.length > 0) arg3 = arg3.toLowerCase();
		switch (arg1) {
			case "hp":
			case "drop":
			case "fall":
				if (!arg2 || isDrop) break;
				arg2 = (parseInt(curHp) * 100 / parseInt(maxHp)) - Number(arg2);
				if (arg2 <= 0) {
					cmd.message("Cannot drop to a value above or equal to your current HP.");
					break;
				}
				isDrop = true;
				mod.toServer("C_PLAYER_LOCATION", 5, { ...aLoc, "loc": aLoc.loc.addN({ "z": 400 + arg2 * (isCastanic ? 20 : 10) }), "type": 2 });
				mod.toServer("C_PLAYER_LOCATION", 5, Object.assign(aLoc, { "type": 7 }));
				isDrop = false;
				break;
			case "set":
			case "save":
				if (arg2) {
					arg3 = aLoc.loc.z + (arg3 ? Number(arg3) : 0);
					aBook[arg2] = {
						"x": aLoc.loc.x,
						"y": aLoc.loc.y,
						"z": arg3,
						"w": wLoc
					};
					saveBook();
				}
				cmd.message(`Location is Saved ${arg2 ? `[${arg2 }] ` : ""}[Zone: ${aZone} x: ${Math.round(aLoc.loc.x)} y: ${Math.round(aLoc.loc.y)} z: ${Math.round(arg3)} w: ${wLoc.toFixed(2)}]`);
				break;
			case "to":
			case "warp":
			case "move":
				if (arg2) {
					if (!aBook[arg2]) {
						cmd.message(`Cannot found book [${arg2}]`);
						break;
					}
					TPInstant(aBook[arg2].x, aBook[arg2].y, aBook[arg2].z, aBook[arg2].w);
				} else {
					TPList();
				}
				break;
			case "remove":
			case "delete":
			case "del":
				if (arg2) {
					if (!aBook[arg2]) {
						cmd.message(`Cannot found book [${arg2}]`);
					} else {
						delete aBook[arg2]; saveBook();
						cmd.message(`Book [${arg2}] has removed`);
					}
				}
				break;
			case "removewithgui":
				if (arg2) {
					if (!aBook[arg2]) {
						cmd.message(`Cannot found book [${arg2}]`);
					} else {
						delete aBook[arg2]; saveBook();
						cmd.message(`Book [${arg2}] has removed`);
						TPList();
					}
				}
				break;
			case "blink":
				blink(arg2 ? Number(arg2) : 50, arg3 ? Number(arg3) : 0);
				break;
			case "back":
			case "last":
				if (tLoc != 0) {
					if (aZone != tLoc.zone) {
						cmd.message(`You are not in zone: ${tLoc.zone}`);
					} else {
						TPInstant(tLoc.x, tLoc.y, tLoc.z, tLoc.w);
					}
				} else {cmd.message("No last point saved!");}
				break;
			case "up":
				if (!arg2) break;
				TPInstant(aLoc.loc.x, aLoc.loc.y, aLoc.loc.z + Number(arg2));
				break;
			case "down":
				if (!arg2) break;
				TPInstant(aLoc.loc.x, aLoc.loc.y, aLoc.loc.z - Number(arg2));
				break;
			case "x":
				if (!arg3) break;
				arg3 = Number(arg3);
				switch (arg2) {
					case "+":
						TPInstant(aLoc.loc.x + arg3, aLoc.loc.y, aLoc.loc.z);
						break;
					case "-":
						TPInstant(aLoc.loc.x - arg3, aLoc.loc.y, aLoc.loc.z);
						break;
				}
				break;
			case "y":
				if (!arg3) break;
				arg3 = Number(arg3);
				switch (arg2) {
					case "+":
						TPInstant(aLoc.loc.x, aLoc.loc.y + arg3, aLoc.loc.z);
						break;
					case "-":
						TPInstant(aLoc.loc.x, aLoc.loc.y - arg3, aLoc.loc.z);
						break;
				}
				break;
			case "z":
				if (!arg3) break;
				arg3 = Number(arg3);
				switch (arg2) {
					case "+":
						TPInstant(aLoc.loc.x, aLoc.loc.y, aLoc.loc.z + arg3);
						break;
					case "-":
						TPInstant(aLoc.loc.x, aLoc.loc.y, aLoc.loc.z - arg3);
						break;
				}
				break;
			case "coord":
			case "where":
			case "loc":
			case "location":
				cmd.message(`Zone: ${aZone} x: ${Math.round(aLoc.loc.x)} y: ${Math.round(aLoc.loc.y)} z: ${Math.round(aLoc.loc.z)} w: ${wLoc.toFixed(2)}`);
				break;
			default:
				if (!isNaN(arg1) && !isNaN(arg2) && !isNaN(arg3)) {
					TPInstant(Number(arg1), Number(arg2), Number(arg3));
				}
				break;
		}
	});

	mod.hook("S_LOGIN", 14, (e) => {
		gameId = e.gameId;
		isCastanic = Math.floor((e.templateId - 10101) / 200) === 3;
	});

	mod.hook("C_PLAYER_LOCATION", 5, (e) => {
		aLoc = e;
		wLoc = e.w;
		if (!isDrop && (e.type == 2 || e.type == 10)) return false;
	});

	mod.hook("S_SPAWN_ME", 3, e => {
		aLoc = e;
		wLoc = e.w;
	});

	mod.hook("S_PLAYER_STAT_UPDATE", 15, e => {
		curHp = e.hp;
		maxHp = e.maxHp;
	});

	mod.hook("S_CREATURE_CHANGE_HP", 6, e => {
		if (e.target === gameId) {
			curHp = e.curHp;
			maxHp = e.maxHp;
		}
	});

	mod.hook("S_LOAD_TOPO", 3, e => {
		aZone = e.zone;
		try {
			aBook = jsonRequire(`./bookmark/${ aZone }.json`);
		} catch (err) {
			aBook = {};
		}
	});

	function saveBook() {
		if (!fs.existsSync(`${__dirname }\\bookmark`))
			fs.mkdirSync(`${__dirname }\\bookmark`);
		fs.writeFileSync(path.join(__dirname, `bookmark\\${ aZone }.json`), JSON.stringify(aBook, null, 2));
	}

	function TPInstant(x, y, z, w = 0) {
		tLoc = {
			"zone": aZone,
			"x": aLoc.loc.x,
			"y": aLoc.loc.y,
			"z": aLoc.loc.z,
			"w": wLoc
		};
		mod.toClient("S_INSTANT_MOVE", 3, {
			"gameId": gameId,
			"loc": { x, y, z },
			"w": w
		});
	}

	function TPList() {
		if (Object.keys(aBook).length > 0) {
			let d = [];
			Object.keys(aBook).forEach(list => {
				d.push({
					"text": `<font color="#4DE19C" size="+24">- ${list}</font>`,
					"command": `tp to ${list}`
				}, {
					"text": "&nbsp;&nbsp;&nbsp;&nbsp;<font color=\"#FE6F5E\" size=\"+10\">[Delete]</font><br>",
					"command": `tp removewithgui ${list}`
				});
			});
			gui.parse(d, `<font color="#E0B0FF">Teleport List - [${aZone}]</font>`);
			d = [];
		}
	}

	function blink(d, n) {
		TPInstant((Math.cos(wLoc) * d) + aLoc.loc.x, (Math.sin(wLoc) * d) + aLoc.loc.y, aLoc.loc.z + n, wLoc);
	}

	function jsonRequire(data) {
		delete require.cache[require.resolve(data)];
		return require(data);
	}
};