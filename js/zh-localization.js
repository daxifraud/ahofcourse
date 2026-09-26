/* Simplified-Chinese UI localization layer.  Game logic and vehicle physics remain unchanged. */
(function () {
  'use strict';

  var VEHICLE_RULES = [
    [/\bRED[-_ ]?MBT[-_ ]?1\b/gi, '59式'],
    [/\bRED[-_ ]?MBT[-_ ]?2\b/gi, '99式'],
    [/\bRED[-_ ]?TD\b/gi, 'PTZ-89'],
    [/\bRED[-_ ]?(?:HELI|ATTACK HELI|ATTACK HELICOPTER)\b/gi, 'WZ-10'],
    [/\bRED[-_ ]?(?:MLRS|ROCKET ARTILLERY|MULTIPLE LAUNCH ROCKET SYSTEM)\b/gi, 'PHL-11'],
    [/\bRED[-_ ]?(?:AA|AIR DEFENSE)\b/gi, 'PGZ-95'],
    [/\bBLUE[-_ ]?MBT[-_ ]?1\b/gi, 'M60'],
    [/\bBLUE[-_ ]?MBT[-_ ]?2\b/gi, 'M1A1'],
    [/\bBLUE[-_ ]?(?:HELI|ATTACK HELI|ATTACK HELICOPTER)\b/gi, 'AH-64D'],
    [/\bBLUE[-_ ]?(?:MLRS|ROCKET ARTILLERY|MULTIPLE LAUNCH ROCKET SYSTEM)\b/gi, 'M124'],
    [/\bBLUE[-_ ]?(?:AA|AIR DEFENSE)\b/gi, '蓝方防空车']
  ];

  /* Longer phrases are applied before individual words. */
  var PHRASES = [
    ['Armored Corps', '装甲军团'],
    ['RED-HEAVY MBT', '99式'],
    ['RED-MEDIUM TANK', '59式'],
    ['RED-TANK DESTROYER', 'PTZ-89'],
    ['RED-ATTACK HELI', 'WZ-10'],
    ['RED-ATTACK HELICOPTER', 'WZ-10'],
    ['RED-ROCKET ARTILLERY', 'PHL-11'],
    ['RED-AIR DEFENSE', 'PGZ-95'],
    ['BLUE-HEAVY MBT', 'M1A1'],
    ['BLUE-MEDIUM TANK', 'M60'],
    ['BLUE-ATTACK HELI', 'AH-64D'],
    ['BLUE-ATTACK HELICOPTER', 'AH-64D'],
    ['BLUE-ROCKET ARTILLERY', 'M124'],
    ['BLUE-AIR DEFENSE', '蓝方防空车'],
    ['RED HEAVY MBT', '99式'],
    ['BLUE HEAVY MBT', 'M1A1'],
    ['RED MEDIUM TANK', '59式'],
    ['BLUE MEDIUM TANK', 'M60'],
    ['TACTICAL SYSTEM // INITIALIZING', '战术系统 // 初始化'],
    ['LOADING ASSETS & COMPILED SHADERS...', '正在加载资源与编译着色器...'],
    ['SYSTEM READY // LAUNCHING...', '系统就绪 // 启动中...'],
    ['POWER OFF', '断电'],
    ['STARTING', '启动中'],
    ['WARMUP', '预热中'],
    ['ACTIVATING…', '激活中……'],
    ['CALIBRATING BALLISTICS & AUDIO DSP...', '正在校准弹道与音频处理...'],
    ['COMPILING SHADERS & PROCEDURAL TERRAIN...', '正在编译着色器与程序化地形...'],
    ['PARSING VEHICLE BLUEPRINTS & TEXTURES...', '正在解析载具蓝图与纹理...'],
    ['PREVIEWING FX SHADERS...', '正在预热特效着色器...'],
    ['INITIALIZING HANGAR // PREPARING VEHICLES...', '正在初始化机库 // 准备载具...'],
    ['COMMANDER HAS PLANNED THE BATTLEFIELD FOCUS', '指挥官已规划战场重点'],
    ['COMMANDER HAS REPLANNED THE BATTLEFIELD FOCUS', '指挥官已重新规划战场重点'],
    ['TEAM DEATHMATCH', '团队死斗'],
    ['FREE-FOR-ALL', '自由混战'],
    ['TO BATTLE', '开始战斗'],
    ['CUSTOM MISSION & WEATHER SETTINGS', '自定义任务与天气设置'],
    ['CUSTOM MISSION', '自定义任务'],
    ['COMBAT READY', '战斗就绪'],
    ['TACTICAL HANGAR', '战术机库'],
    ['TACTICAL MAP // TOP VIEW', '战术地图 // 俯视图'],
    ['TACTICAL PANEL', '战术面板'],
    ['TACTICAL BIOS', '战术 BIOS'],
    ['TACTICAL SYSTEM', '战术系统'],
    ['BATTLEFIELD REPAIR', '战场维修'],
    ['BATTLEFIELD REPAIR // ', '战场维修 // '],
    ['CONTROL ZONE // STOPPED', '控制区 // 已停止'],
    ['CONTROL ZONE // READY', '控制区 // 就绪'],
    ['CONTROL ZONE // ', '控制区 // '],
    ['CAPTURE PAUSED // ', '占领暂停 // '],
    ['REPAIR PREP // STOPPED', '维修准备 // 已停止'],
    ['REPAIR IN 5.0s', '将在 5.0 秒后维修'],
    ['REPAIR IN 10S', '将在 10 秒后维修'],
    ['ETA // ', '预计时间 // '],
    ['ZONE: N/A', '区域：无'],
    ['ZONE: STANDBY', '区域：待机'],
    ['EVENT LINK // FIRE / LOSS', '事件链路 // 开火 / 损失'],
    ['LEAVING COMBAT ZONE · RETURN NOW', '正在离开战区 · 立即返回'],
    ['INCOMING MISSILE', '来袭导弹'],
    ['TARGET DESTROYED!', '目标已摧毁！'],
    ['NO VALID AIMPOINT', '没有有效瞄准点'],
    ['AIM TOO CLOSE, MIN RANGE 35M', '目标过近，最小距离 35 米'],
    ['NO GUN EQUIPPED', '未装备火炮'],
    ['CANNOT FIRE', '无法开火'],
    ['AMMO RACK DAMAGED - HOLD FIRE', '弹药架受损 - 暂停开火'],
    ['MISSILE RACK DAMAGED - HOLD FIRE', '导弹架受损 - 暂停开火'],
    ['LAUNCHER DAMAGED - HOLD FIRE', '发射架受损 - 暂停开火'],
    ['DECOY FLARES DEPLOYED', '诱饵弹已释放'],
    ['DECOY FLARES EMPTY', '诱饵弹耗尽'],
    ['DEFEAT! ELIMINATED', '失败！已被淘汰'],
    ['DEFEAT!', '失败！'],
    ['LAST SURVIVOR', '最后幸存者'],
    ['MUTUAL KILL', '同归于尽'],
    ['OUT OF FORCES', '兵力耗尽'],
    ['NO RESERVE VEHICLES', '没有预备载具'],
    ['NO VEHICLES IN PLAY', '没有在场载具'],
    ['NO STRENGTH - NO DEPLOY', '没有兵力 - 无法部署'],
    ['NO SQUAD AVAILABLE', '没有可用小队'],
    ['NO REPAIRABLE MODULE', '没有可维修模块'],
    ['STOP TO REPAIR', '停车维修'],
    ['AWAITING DAMAGE', '等待受损'],
    ['ENGINE SHUTDOWN (POWER OFF)', '发动机关闭（断电）'],
    ['ENGINE STARTING', '发动机启动中'],
    ['POWERING UP', '通电中'],
    ['POWER OFF', '断电'],
    ['NORMAL RELOAD // FATIGUED', '正常装填 // 疲劳'],
    ['SUPER RELOAD ×2 // BURST LOADING', '超级装填 ×2 // 连发装填'],
    ['BURST LOADING', '连发装填'],
    ['COMMAND MODE', '指挥模式'],
    ['COMMAND MODE (A SHOOTS, B GUIDES)', '指挥模式（A 射击，B 引导）'],
    ['WEAPON [1]: MAIN GUN', '武器 [1]：主炮'],
    ['WEAPON [1]: AP ROUND', '武器 [1]：穿甲弹'],
    ['WEAPON [1]: MISSILE', '武器 [1]：导弹'],
    ['WEAPON [1]: SAM', '武器 [1]：地空导弹'],
    ['WEAPON [2]: GUN-LAUNCHED MISSILE', '武器 [2]：炮射导弹'],
    ['WEAPON [2]: HIGH-EXPLOSIVE', '武器 [2]：高爆弹'],
    ['WEAPON [2]: ATGM', '武器 [2]：反坦克导弹'],
    ['WEAPON [2]: ROCKETS', '武器 [2]：火箭弹'],
    ['WEAPON [2]: TWIN GUN', '武器 [2]：双联机炮'],
    ['WEAPON [3]: TWIN GUN', '武器 [3]：双联机炮'],
    ['WEAPON [3]: GUN', '武器 [3]：机炮'],
    ['TACTICAL MAP', '战术地图'],
    ['CONTROL ZONE', '控制区'],
    ['COMMANDER', '指挥官'],
    ['RANGE --- m', '距离 --- 米'],
    ['AZ: 00°  EL: 00°', '方位：00°  仰角：00°'],
    ['TGT: NONE', '目标：无'],
    ['FCR: STANDBY', '火控雷达：待机'],
    ['FCR: WARMING UP', '火控雷达：预热中'],
    ['FIREPOWER', '火力'],
    ['PROTECTION', '防护'],
    ['MOBILITY', '机动'],
    ['OPTICS & FCS', '光学与火控'],
    ['125mm smoothbore gun', '125毫米滑膛炮'],
    ['Heavy composite + ERA', '重型复合装甲 + 爆炸反应装甲'],
    ['Thermal / Laser suppressor', '热成像 / 激光压制器'],
    ['Vehicle Bay Index', '载具库索引'],
    ['Vehicle Bay', '载具库'],
    ['Vehicle Levels', '载具等级'],
    ['TECH DATA PENDING', '技术数据待定'],
    ['AVAILABLE EXPERIENCE', '可用经验'],
    ['ACHIEVEMENT INDEX', '成就索引'],
    ['ACHIEVEMENT PROTOCOL', '成就协议'],
    ['COMMENDATIONS / FIELD RECORDS / ARCHIVE SCHEMA 03', '嘉奖 / 战场记录 / 档案架构 03'],
    ['PERSONNEL RECORD // LOCAL ARCHIVE', '人员记录 // 本地档案'],
    ['LOCAL ARCHIVE // READY', '本地档案 // 就绪'],
    ['LOCAL ARCHIVE', '本地档案'],
    ['DATABASE ONLINE', '数据库在线'],
    ['RECORDS UPDATED', '记录已更新'],
    ['NO VEHICLE TYPES REGISTERED', '未注册载具类型'],
    ['CURRENT DEPLOYMENT', '当前部署'],
    ['ONE LIFE RECORD', '单局生存记录'],
    ['LONGEST CONFIRMED KILL', '最远确认击杀'],
    ['DESTROYED BY VEHICLE', '按载具统计的摧毁数'],
    ['SORTIES BY VEHICLE', '按载具统计的出击数'],
    ['PLAYER DATA // DEVICE STORAGE ONLY', '玩家数据 // 仅保存在本设备'],
    ['GAME SETTINGS', '游戏设置'],
    ['SYSTEM & VISUALS', '系统与画面'],
    ['CONTROLS GUIDE (KEYBOARD & MOUSE)', '操作指南（键盘与鼠标）'],
    ['PC CONTROLS', '电脑端操作'],
    ['DATA WIPE PROTOCOL', '数据清除协议'],
    ['THIS WILL CLEAR ALL STATISTICS AND UNLOCKED UPGRADES!', '这将清除所有统计数据和已解锁升级！'],
    ['PAUSED // COMBAT PAUSED', '已暂停 // 战斗暂停'],
    ['SYSTEM HALT', '系统暂停'],
    ['RESTART TO APPLY', '重启后生效'],
    ['OVERRIDDEN BY URL PARAM', '已被网址参数覆盖'],
    ['OVERRIDDEN BY URL PARAM', '已被网址参数覆盖'],
    ['DRAG CONTROLS TO REPOSITION', '拖动控件以重新定位'],
    ['DRAG TO MOVE · HOLD + PINCH TO RESIZE', '拖动按钮移动位置 · 按住按钮后双指开合调整大小'],
    ['TOUCH CONTROLS', '触控操作'],
    ['Joystick drive / heli pad', '摇杆驾驶 / 直升机十字键'],
    ['Aim turret / camera', '瞄准炮塔 / 视角'],
    ['Two-finger pinch', '双指开合'],
    ['Sight zoom', '炮镜缩放'],
    ['Fire gun / rockets / cannon', '主炮 / 火箭 / 机炮开火'],
    ['Night vision / thermal', '夜视 / 热成像'],
    ['Squad orders', '小队指令'],
    ['Hold for laser suppress', '按住激光压制'],
    ['Tap to switch weapons', '点按切换武器'],
    ['Tap to change size', '点按切换大小'],
    ['Left thumb', '左手拇指'],
    ['Right drag', '右半屏拖动'],
    ['Weapon bar', '武器栏'],
    ['Mini-map', '小地图'],
    ['M: CYCLE', 'M：循环切换'],
    ['TOP LEFT (DEFAULT)', '左上（默认）'],
    ['SMALL (DEFAULT)', '小（默认）'],
    ['FIRE / LOSS', '开火 / 损失'],
    ['HANGER', '机库'],
    ['HANGAR', '机库'],
    ['HANGAR // VEHICLE INSPECTION', '机库 // 载具检视'],
    ['TANK SUPPORT', '坦克支援'],
    ['ARTILLERY SUPPORT', '炮兵支援'],
    ['AIR SUPPORT', '空中支援'],
    ['STRATEGIC SUPPORT', '战略支援'],
    ['STRATEGIC BOMBARDMENT', '战略轰击'],
    ['STRATEGIC TRANSPORT', '战略运输'],
    ['AIR REINFORCEMENTS', '空中增援'],
    ['Game mode', '游戏模式'],
    ['Faction', '阵营'],
    ['Vehicle', '载具'],
    ['Time', '时间'],
    ['Map size', '地图大小'],
    ['Staging base', '集结基地'],
    ['Control zones', '控制区'],
    ['Roughness', '崎岖度'],
    ['Volume', '音量'],
    ['Music', '音乐'],
    ['CRT filter', 'CRT 滤镜'],
    ['Color grade', '色彩分级'],
    ['Mini-map position', '小地图位置'],
    ['Mini-map size', '小地图大小'],
    ['Aim sensitivity', '瞄准灵敏度'],
    ['Explosion FX', '爆炸特效'],
    ['Model quality', '模型质量'],
    ['Debug: Off', '调试：关'],
    ['FPS: On', '帧率：开'],
    ['Kill feed: On', '击杀信息：开'],
    ['Touch layout', '触控布局'],
    ['Available vehicle', '可用载具'],
    ['Active vehicles', '在场载具'],
    ['Max vehicles in play', '最大在场载具数'],
    ['Powerup density', '强化道具密度'],
    ['FREE-FOR-ALL ROSTER', '自由混战编制'],
    ['FREE-FOR-ALL STATUS', '自由混战状态'],
    ['Left click', '左键'],
    ['Right click', '右键'],
    ['Gunner sight', '炮手瞄准镜'],
    ['Zoom / heli lift', '缩放 / 直升机升降'],
    ['Radar on/off & scan', '雷达开关与扫描'],
    ['Thermal imaging (FLIR)', '热成像（FLIR）'],
    ['Night vision (NV)', '夜视（NV）'],
    ['10x precision aim', '10 倍精确瞄准'],
    ['Capture zone', '占领控制区'],
    ['Follow formation', '跟随编队'],
    ['Bail out / redeploy', '弃车 / 重部署'],
    ['Tac marker', '战术标记'],
    ['Mini-map size / toggle', '小地图大小 / 开关'],
    ['NO RECORD', '无记录'],
    ['CURRENT DEPLOYMENT', '当前部署'],
    ['RANGE --- m', '距离 --- 米'],
    ['RLD', '装填'],
    ['CAP', '占领'],
    ['Z+', '维修 +'],
    ['BATTLE OVER', '战斗结束'],
    ['ENEMY TALLY', '敌方统计'],
    ['FRIENDLY LOSSES', '友方损失'],
    ['CREWS BAILED', '弃车乘员'],
    ['FOE VEH CAPTURED', '俘获敌方载具'],
    ['FOE VEH KILLED', '摧毁敌方载具'],
    ['CREWS LOST', '损失乘员'],
    ['EXPERIENCE EARNED', '获得经验'],
    ['LOCAL RECORDS DETECTED', '检测到本地记录'],
    ['REPAIR PREP', '维修准备'],
    ['SAFE ZONE ACTIVE', '安全区生效'],
    ['SAFE ZONE ESTABLISHED', '安全区已建立'],
    ['ZONE SHRINK WARNING', '区域收缩警告'],
    ['IN BOMBARDMENT ZONE', '处于轰击区'],
    ['BOMBARDMENT ZONE', '轰击区'],
    ['AIR REINFORCEMENTS ARRIVED: +50 FORCES', '空中增援已抵达：+50 兵力'],
    ['AIR REINFORCEMENTS (+50 FORCES)', '空中增援（+50 兵力）'],
    ['TARGETS...', '目标……'],
    ['TOOK THE OBJECTIVE!', '已夺取目标点！'],
    ['TOOK OVER', '已接管'],
    ['RETURNED TO UNIT', '已返回单位'],
    ['SQUAD: FOLLOW', '小队：跟随'],
    ['SQUAD: SEIZE', '小队：夺取'],
    ['SQUAD COMMAND', '小队指挥'],
    ['RECORDS UPDATED', '记录已更新'],
    ['FINAL RANK', '最终排名'],
    ['PLAYER KILLS', '玩家击杀'],
    ['SURVIVORS LEFT', '剩余幸存者']
  ];

  var WORDS = {
    'FORCES':'兵力', 'ACTIVE':'在场', 'KILLS':'击杀', 'REDEPLOYS':'重部署', 'SURVIVORS':'幸存者',
    'PLAYER':'玩家', 'ENEMY':'敌方', 'OUR':'我方', 'FRIENDLY':'友方', 'FOE':'敌方', 'RESERVE':'预备', 'RESERVES':'预备兵力',
    'VEHICLE':'载具', 'VEHICLES':'载具', 'VEH':'载具', 'CREW':'乘员', 'CREWS':'乘员', 'FORCE':'兵力',
    'RED':'红方', 'BLUE':'蓝方', 'RED OOB':'红方编制', 'BLUE OOB':'蓝方编制',
    'READY':'就绪', 'PREPARING':'准备中', 'STARTING':'启动中', 'LOADING':'装填中', 'RELOADING':'重新装填中',
    'RELOAD':'装填', 'REDEPLOY':'重部署', 'DEPLOY':'部署', 'WAITING':'等待中', 'ONLINE':'在线', 'OFFLINE':'离线',
    'ON':'开', 'OFF':'关', 'LIVE':'在线', 'SYNC':'同步', 'GRANTED':'已授权', 'ARCHIVED':'已归档',
    'ACTIVE':'在场', 'STATUS':'状态', 'WARNING':'警告', 'ERROR':'错误', 'FAIL':'失败', 'FAILED':'失败',
    'FIRE':'开火', 'FIREPOWER':'火力', 'CANNON':'机炮', 'GUN':'火炮', 'MAIN':'主', 'TURRET':'炮塔',
    'MISSILE':'导弹', 'ROCKET':'火箭弹', 'ROCKETS':'火箭弹', 'CANNON':'机炮', 'SAM':'地空导弹', 'ATGM':'反坦克导弹',
    'AP':'穿甲', 'ROUND':'弹', 'HIGH-EXPLOSIVE':'高爆弹', 'HE':'高爆弹', 'ARMOR':'装甲', 'ARMOUR':'装甲',
    'PROTECTION':'防护', 'ENGINE':'发动机', 'FUEL':'燃料', 'AMMO':'弹药', 'TRACK':'履带', 'WHEELS':'车轮',
    'TRANSMISSION':'传动', 'MOBILITY':'机动', 'POWER':'动力', 'PWR':'动力', 'SPEED':'速度', 'RANGE':'距离',
    'TARGET':'目标', 'TARGETS':'目标', 'TGT':'目标', 'LOCK':'锁定', 'LOCKED':'已锁定', 'LOCKING':'锁定中',
    'TRACKING':'跟踪中', 'TRACKED':'被跟踪', 'WARNING':'警告', 'INCOMING':'来袭', 'IMPACT':'命中', 'HIT':'命中',
    'CAPTURE':'占领', 'CAPTURING':'占领中', 'CONTESTED':'争夺中', 'OPEN':'开放', 'ZONE':'区域', 'SECTOR':'扇区',
    'BOUNDARY':'边界', 'RETURN':'返回', 'NOW':'现在', 'LEFT':'左', 'RIGHT':'右', 'TOP':'上', 'BOTTOM':'下',
    'CENTER':'中央', 'BASE':'基地', 'STAGING':'集结', 'MAP':'地图', 'GRID':'网格', 'SIZE':'大小', 'POSITION':'位置',
    'SMALL':'小', 'MEDIUM':'中', 'LARGE':'大', 'DEFAULT':'默认', 'OFF':'关', 'HIGH':'高', 'LOW':'低', 'MED':'中',
    'VOLUME':'音量', 'MUSIC':'音乐', 'FILTER':'滤镜', 'COLOR':'色彩', 'GRADE':'分级', 'GRAPHICS':'画面',
    'QUALITY':'质量', 'MODEL':'模型', 'EXPLOSION':'爆炸', 'TOUCH':'触控', 'LAYOUT':'布局', 'RESET':'重置', 'SAVE':'保存',
    'VIEW':'视角', 'ROTATE':'旋转', 'INSPECT':'检视', 'MENU':'菜单', 'SIGHT':'瞄准镜', 'BAIL':'弃车', 'FOLLOW':'跟随',
    'COMMAND':'指挥', 'CMD':'指挥', 'NIGHT':'夜视', 'VISION':'视觉', 'THERMAL':'热成像', 'FLIR':'热成像', 'LASER':'激光',
    'SUPPRESS':'压制', 'DECOY':'诱饵', 'FLARES':'诱饵弹', 'RADAR':'雷达', 'SEARCH':'搜索', 'AIR':'空中', 'GROUND':'地面',
    'HELICOPTER':'直升机', 'HELI':'直升机', 'ATTACK':'攻击', 'MULTIPLE':'多管', 'LAUNCH':'发射', 'ARTILLERY':'炮兵',
    'DEFENSE':'防空', 'DESTROYER':'歼击车', 'TANK':'坦克', 'HEAVY':'重型', 'MEDIUM':'中型', 'LIGHT':'轻型',
    'FCS':'火控系统', 'OPTICS':'光学', 'FIRE CONTROL':'火控', 'COMBAT':'战斗', 'BATTLE':'战斗', 'TACTICAL':'战术',
    'SYSTEM':'系统', 'SETTINGS':'设置', 'GUIDE':'指南', 'KEYBOARD':'键盘', 'MOUSE':'鼠标', 'DRIVE':'驾驶', 'HEADING':'航向',
    'GAME':'游戏', 'MODE':'模式', 'FACTION':'阵营', 'TIME':'时间', 'ROUGHNESS':'崎岖度', 'STAGING':'集结',
    'HULL':'车体', 'TRAVERSE':'转向', 'CLICK':'点击', 'WHEEL':'滚轮', 'ZOOM':'缩放', 'RADAR':'雷达', 'SCAN':'扫描',
    'THERMAL':'热成像', 'PRECISION':'精确', 'AIM':'瞄准', 'FORMATION':'编队', 'TAC':'战术', 'MARKER':'标记', 'TOGGLE':'切换',
    'DATA':'数据', 'DATABASE':'数据库', 'ARCHIVE':'档案', 'RECORD':'记录', 'RECORDS':'记录', 'ACHIEVEMENT':'成就',
    'LEVEL':'等级', 'EXPERIENCE':'经验', 'TECH':'技术', 'PENDING':'待定', 'PROTOCOL':'协议', 'SCHEMA':'架构',
    'PERSONNEL':'人员', 'SORTIES':'出击', 'DESTROYED':'摧毁', 'CURRENT':'当前', 'DEPLOYMENT':'部署', 'NO':'无', 'NONE':'无',
    'UNKNOWN':'未知', 'NOMINAL':'正常', 'N/A':'无', 'READY':'就绪', 'PAUSED':'暂停', 'RESUME':'继续', 'SUSPEND':'暂停',
    'SYSTEM':'系统', 'HALT':'暂停', 'REPAIR':'维修', 'REPAIRING':'维修中', 'REPAIRED':'已维修', 'DAMAGE':'损伤',
    'DAMAGED':'受损', 'MODULE':'模块', 'STOP':'停止', 'START':'开始', 'RETURNED':'已返回', 'ABANDONED':'已弃车',
    'TAKE':'夺取', 'TOOK':'已夺取', 'OBJECTIVE':'目标点', 'VICTORY':'胜利', 'DEFEAT':'失败', 'ELIMINATED':'已淘汰',
    'LAST':'最后', 'SURVIVOR':'幸存者', 'RANK':'排名', 'FINAL':'最终', 'TALLY':'统计', 'LOSS':'损失', 'LOSSES':'损失',
    'REMAINING':'剩余', 'LEFT':'剩余', 'KILLED':'击杀', 'KILL':'击杀', 'KILLS':'击杀', 'SQUAD':'小队', 'SEIZE':'夺取',
    'SHOOT':'射击', 'GUIDE':'引导', 'ABANDON':'弃车', 'RELEASED':'已释放', 'ACTIVATING':'激活中', 'ACQUIRING':'获取中',
    'CALIBRATING':'校准中', 'COMPILING':'编译中', 'PARSING':'解析中', 'INITIALIZING':'初始化中', 'WARMING':'预热中',
    'POWERING':'通电中', 'NOMINAL':'正常', 'RELOADED':'已装填', 'EMPTY':'空', 'SAFE':'安全', 'ESTABLISHED':'已建立',
    'DENSITY':'密度', 'SUPPORT':'支援', 'BOMBARDMENT':'轰击', 'TRANSPORT':'运输', 'REINFORCEMENTS':'增援', 'ARRIVED':'已抵达',
    'GUNNER':'炮手', 'COLLECTIVE':'总距', 'PITCH':'俯仰', 'ROLL':'横滚', 'YAW':'偏航', 'TRIM':'配平', 'UP':'上', 'DOWN':'下',
    'YOU':'你', 'OVER':'接管', 'PEN':'穿深', 'MV':'初速', 'DMG':'伤害', 'HP':'生命值', 'XP':'经验', 'KPH':'公里/小时',
    'KM/H':'公里/小时', 'KM':'公里', 'MM':'毫米', 'M/S':'米/秒', 'DEG/S':'度/秒',
    'DAY':'白天', 'DAWN':'黎明', 'DUSK':'黄昏', 'NIGHT':'夜晚', 'TIME':'时间', 'ROUGHNESS':'崎岖度', 'CONTROL':'控制',
    'HANGER':'机库', 'HANGAR':'机库', 'SECTOR':'扇区', 'LINK':'链路', 'NOISE':'噪声', 'REPORT':'报告', 'AUTH':'授权',
    'PWR':'动力', 'FPS':'帧率', 'SCANNING':'扫描中', 'STANDBY':'待机', 'WARMUP':'预热', 'READY':'就绪', 'NONE':'无'
  };

  function escapeRegExp(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function translateText(input) {
    if (input == null) return input;
    var text = String(input);
    if (!/[A-Za-z]/.test(text)) return text;
    var bareVehicle = text.trim().toLowerCase();
    if (bareVehicle === 'mbt2') return 'M1A1';
    if (bareVehicle === 'heli') return 'AH-64D';
    if (bareVehicle === 'mlrs') return 'M124';
    for (var i = 0; i < VEHICLE_RULES.length; i++) text = text.replace(VEHICLE_RULES[i][0], VEHICLE_RULES[i][1]);
    text = text.replace(/(\d+(?:\.\d+)?)\s*s\b/gi, '$1秒');
    text = text.replace(/(\d+(?:\.\d+)?)\s*m\b/gi, '$1米');
    var ordered = PHRASES.slice().sort(function (a, b) { return b[0].length - a[0].length; });
    for (i = 0; i < ordered.length; i++) {
      var src = ordered[i][0];
      text = text.replace(new RegExp(escapeRegExp(src), 'gi'), ordered[i][1]);
    }
    var keys = Object.keys(WORDS).sort(function (a, b) { return b.length - a.length; });
    for (i = 0; i < keys.length; i++) {
      var key = keys[i];
      text = text.replace(new RegExp('(^|[^A-Za-z0-9])' + escapeRegExp(key) + '(?=$|[^A-Za-z0-9])', 'gi'), '$1' + WORDS[key]);
    }
    return text;
  }

  function translateAttrs(el) {
    if (!el || el.nodeType !== 1) return;
    ['title', 'aria-label', 'placeholder', 'value'].forEach(function (attr) {
      if (!el.hasAttribute(attr)) return;
      var old = el.getAttribute(attr), next = translateText(old);
      if (next !== old) el.setAttribute(attr, next);
    });
  }
  function translateNode(node) {
    if (!node) return;
    if (node.nodeType === 3) {
      var next = translateText(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
      return;
    }
    if (node.nodeType !== 1 || node.tagName === 'SCRIPT' || node.tagName === 'STYLE') return;
    translateAttrs(node);
    for (var c = node.firstChild; c; c = c.nextSibling) translateNode(c);
  }
  function translateAll() {
    if (!document.body) return;
    translateNode(document.body);
    document.title = translateText(document.title);
  }

  function wrapGlobal(name) {
    var fn = window[name];
    if (typeof fn !== 'function' || fn.__zhWrapped) return;
    var wrapped = function () {
      var args = Array.prototype.slice.call(arguments);
      if (args.length) args[0] = translateText(args[0]);
      return fn.apply(this, args);
    };
    wrapped.__zhWrapped = true;
    window[name] = wrapped;
  }
  function wrapOutput(name) {
    var fn = window[name];
    if (typeof fn !== 'function' || fn.__zhWrapped) return;
    var wrapped = function () { return translateText(fn.apply(this, arguments)); };
    wrapped.__zhWrapped = true;
    window[name] = wrapped;
  }

  function install() {
    translateAll();
    wrapGlobal('aimHint');
    wrapOutput('vehicleKindName');
    wrapOutput('vehicleDisplayName');
    if (typeof window.alert === 'function' && !window.alert.__zhWrapped) {
      var alertFn = window.alert;
      window.alert = function (msg) { return alertFn.call(this, translateText(msg)); };
      window.alert.__zhWrapped = true;
    }
    if (typeof window.confirm === 'function' && !window.confirm.__zhWrapped) {
      var confirmFn = window.confirm;
      window.confirm = function (msg) { return confirmFn.call(this, translateText(msg)); };
      window.confirm.__zhWrapped = true;
    }
    if (typeof MutationObserver !== 'undefined' && document.body && !document.body.__zhObserver) {
      var observer = new MutationObserver(function (records) {
        records.forEach(function (record) {
          if (record.type === 'characterData') translateNode(record.target);
          else if (record.type === 'attributes') translateAttrs(record.target);
          else for (var i = 0; i < record.addedNodes.length; i++) translateNode(record.addedNodes[i]);
        });
      });
      observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['title', 'aria-label', 'placeholder', 'value'] });
      document.body.__zhObserver = observer;
    }
    var style = document.createElement('style');
    style.textContent = ".sigmod #sigfps::after{content:' 帧率' !important;}";
    document.head.appendChild(style);
    if (window.CanvasRenderingContext2D && !window.CanvasRenderingContext2D.prototype.__zhWrapped) {
      var canvasProto = window.CanvasRenderingContext2D.prototype;
      var nativeFillText = canvasProto.fillText, nativeStrokeText = canvasProto.strokeText;
      canvasProto.fillText = function (text) {
        var args = Array.prototype.slice.call(arguments); args[0] = translateText(text);
        return nativeFillText.apply(this, args);
      };
      canvasProto.strokeText = function (text) {
        var args = Array.prototype.slice.call(arguments); args[0] = translateText(text);
        return nativeStrokeText.apply(this, args);
      };
      canvasProto.__zhWrapped = true;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
  else install();
  window.ZH_LOCALIZE = translateText;
})();
