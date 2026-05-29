# Collision Layer / Mask 的工程化设计

Godot 默认所有碰撞对象都在第 1 层,也都扫描第 1 层。Demo 阶段没问题,一旦有玩家、敌人、子弹、拾取物、触发器,这个默认值就会让所有东西互相看见。

> 一句话先记住:**Layer 是“我是谁”,Mask 是“我想看谁”。**

这两个不是一回事。把它们分清,碰撞系统才不会乱。

---

## 一、先用人话理解

每个 `CollisionObject2D` 都有两个字段:

```text
collision_layer  我属于哪些层
collision_mask   我会检测哪些层
```

比如玩家:

```text
玩家 body 属于 player_body
玩家 body 检测 terrain 和 enemy_body
```

比如玩家攻击:

```text
玩家 hitbox 属于 player_hitbox
玩家 hitbox 只检测 enemy_hurtbox
```

这样玩家的剑不会打到自己,也不会去扫地形和拾取物。

---

## 二、不要把所有东西放 Layer 1

一开始就给 2D Physics Layer 命名:

```text
1  terrain
2  platform
3  player_body
4  player_hitbox
5  player_hurtbox
6  enemy_body
7  enemy_hitbox
8  enemy_hurtbox
9  pickup
10 trigger
```

去这里改:

```text
Project Settings -> Layer Names -> 2D Physics
```

命名以后 Inspector 里的小方格才有意义。否则后期你看到第 6 层第 8 层,根本不知道是谁。

---

## 三、一张够用的矩阵

先按这张表配:

```text
terrain         layer: terrain         mask: none
platform        layer: platform        mask: none
player_body     layer: player_body     mask: terrain, platform, enemy_body
enemy_body      layer: enemy_body      mask: terrain, platform, player_body
player_hitbox   layer: player_hitbox   mask: enemy_hurtbox
enemy_hitbox    layer: enemy_hitbox    mask: player_hurtbox
player_hurtbox  layer: player_hurtbox  mask: none
enemy_hurtbox   layer: enemy_hurtbox   mask: none
pickup          layer: pickup          mask: player_body
trigger         layer: trigger         mask: player_body
```

注意地形通常不需要 mask。地形站在那里就行,是玩家和子弹主动去检测它。

---

## 四、hitbox 和 hurtbox 要分开

动作游戏里不要让“身体碰撞”和“受伤范围”混在一起。

推荐结构:

```text
Player (CharacterBody2D)          layer player_body, mask terrain/platform/enemy_body
├── Hurtbox (Area2D)              layer player_hurtbox, mask none
└── AttackHitbox (Area2D)         layer player_hitbox, mask enemy_hurtbox
```

敌人同理:

```text
Enemy (CharacterBody2D)           layer enemy_body, mask terrain/platform/player_body
├── Hurtbox (Area2D)              layer enemy_hurtbox, mask none
└── AttackHitbox (Area2D)         layer enemy_hitbox, mask player_hurtbox
```

身体负责挡路。hurtbox 负责被打。hitbox 负责打别人。

不要让攻击 hitbox 直接扫 `enemy_body`,否则你以后想做“身体很大但弱点很小”的敌人就难受。

---

## 五、Area2D 两个开关

`Area2D` 有两个容易混的布尔值:

```text
monitoring    我主动检测别人
monitorable   我允许被别人检测
```

典型设置:

```text
Hitbox:   monitoring true,  monitorable false
Hurtbox:  monitoring false, monitorable true
Pickup:   monitoring true,  monitorable false
Trigger:  monitoring true,  monitorable false
```

hitbox 开启攻击窗口时:

```gdscript
func enable_hitbox() -> void:
    monitoring = true

func disable_hitbox() -> void:
    monitoring = false
```

这个开关可以由第 08 篇的 `AnimationPlayer` 时间轴控制。

---

## 六、用常量避免魔法数字

不要在脚本里到处写 `1 << 7`。

```gdscript
# res://core/collision_layers.gd
class_name CollisionLayers
extends RefCounted

const TERRAIN := 1
const PLATFORM := 2
const PLAYER_BODY := 3
const PLAYER_HITBOX := 4
const PLAYER_HURTBOX := 5
const ENEMY_BODY := 6
const ENEMY_HITBOX := 7
const ENEMY_HURTBOX := 8
const PICKUP := 9
const TRIGGER := 10

static func bit(layer_number: int) -> int:
    return 1 << (layer_number - 1)

static func bits(values: Array[int]) -> int:
    var result := 0
    for layer_number in values:
        result |= bit(layer_number)
    return result
```

用法:

```gdscript
func _ready() -> void:
    collision_layer = CollisionLayers.bit(CollisionLayers.PLAYER_HITBOX)
    collision_mask = CollisionLayers.bit(CollisionLayers.ENEMY_HURTBOX)
```

Inspector 配也可以,但核心节点建议有一份代码常量作为项目约定。

---

## 七、RayCast2D 和 ShapeCast2D

不是所有检测都要靠 Area2D。

```text
RayCast2D     一条线。适合地面检测、视线检测、射击命中。
ShapeCast2D   一个形状扫过去。适合近战范围、前方空间检测。
Area2D        持续重叠。适合触发器、hurtbox、拾取物。
```

敌人看玩家有没有被墙挡住:

```gdscript
@onready var _ray: RayCast2D = %VisionRay

func can_see_player(player: Node2D) -> bool:
    _ray.target_position = to_local(player.global_position)
    _ray.force_raycast_update()
    return _ray.is_colliding() and _ray.get_collider() == player
```

记得给 RayCast2D 配 mask,否则它也会扫到一堆不该看的东西。

---

## 八、Layer 不是阵营系统

不要把层命名成:

```text
fire_damage
ice_damage
poison_damage
boss_damage
```

伤害类型应该是数据:

```gdscript
@export var damage_type: StringName = &"fire"
@export var damage: int = 10
```

Layer 只回答“物理引擎要不要检测这两类对象”。火抗、冰抗、护甲、暴击,都应该在命中后的伤害系统里算。

---

## 验收

- 2D Physics Layer 已经命名。
- 地形有 layer,通常没有 mask。
- 玩家 body、hitbox、hurtbox 是三个不同碰撞对象。
- hitbox 只扫对方 hurtbox。
- pickup 和 trigger 不阻挡玩家。
- 脚本里没有散落的位运算魔法数字。

---

## 常见坑

**坑 1:只配 layer,忘了 mask。**

layer 是身份,mask 是主动扫描。没有 mask,很多信号不会触发。

**坑 2:把 body 当 hurtbox。**

身体碰撞和受伤范围分开,后面做弱点、无敌帧、护盾才有空间。

**坑 3:trigger 会挡住玩家。**

触发器用 `Area2D`,不要用 `StaticBody2D`。

**坑 4:group 和 layer 混用。**

物理过滤用 layer/mask;“这是第 3 波敌人”“这是 boss”这种逻辑标签用 group。

---

下一篇讲 Camera2D、震屏和分辨率。角色能动能撞以后,镜头要跟得舒服。
