# CanvasItem Shader 与常见 2D 特效

有些效果不是动画、粒子、光源能做好的。比如闪白、描边、溶解、水波,都需要逐像素改颜色。这就是 2D shader 的位置。

> 一句话先记住:**全局改色用 modulate,逐像素规则才用 shader。**

---

## 一、最小 CanvasItem Shader

```glsl
shader_type canvas_item;

void fragment() {
    COLOR = texture(TEXTURE, UV);
}
```

挂载方式:

```text
Sprite2D.material -> New ShaderMaterial -> shader 选择 .gdshader
```

GDScript 改参数:

```gdscript
sprite.material.set_shader_parameter("flash_amount", 1.0)
```

---

## 二、受击闪白

```glsl
shader_type canvas_item;

uniform float flash_amount : hint_range(0.0, 1.0) = 0.0;

void fragment() {
    vec4 color = texture(TEXTURE, UV);
    color.rgb = mix(color.rgb, vec3(1.0), flash_amount);
    COLOR = color;
}
```

受击时:

```gdscript
func flash(sprite: CanvasItem) -> void:
    var mat := sprite.material as ShaderMaterial
    mat.set_shader_parameter("flash_amount", 1.0)
    var tween := create_tween()
    tween.tween_method(
        func(v: float): mat.set_shader_parameter("flash_amount", v),
        1.0,
        0.0,
        0.12
    )
```

注意:如果多个角色共享同一个 `ShaderMaterial`,改参数会一起闪。需要每个实例不同参数时,复制 material 或使用 instance shader parameter。

---

## 三、描边

```glsl
shader_type canvas_item;

uniform vec4 outline_color : source_color = vec4(1.0, 1.0, 1.0, 1.0);
uniform float outline_width = 1.0;

void fragment() {
    vec4 base = texture(TEXTURE, UV);

    float alpha = base.a;
    vec2 px = TEXTURE_PIXEL_SIZE * outline_width;

    alpha = max(alpha, texture(TEXTURE, UV + vec2(px.x, 0.0)).a);
    alpha = max(alpha, texture(TEXTURE, UV + vec2(-px.x, 0.0)).a);
    alpha = max(alpha, texture(TEXTURE, UV + vec2(0.0, px.y)).a);
    alpha = max(alpha, texture(TEXTURE, UV + vec2(0.0, -px.y)).a);

    if (base.a > 0.0) {
        COLOR = base;
    } else {
        COLOR = vec4(outline_color.rgb, outline_color.a * alpha);
    }
}
```

描边会多采样几次贴图。只给选中目标、可交互物体、受击强调用,不要全屏所有 sprite 都描边。

---

## 四、溶解

需要一张噪声图:

```glsl
shader_type canvas_item;

uniform sampler2D noise_texture;
uniform float dissolve : hint_range(0.0, 1.0) = 0.0;
uniform vec4 edge_color : source_color = vec4(1.0, 0.6, 0.1, 1.0);

void fragment() {
    vec4 base = texture(TEXTURE, UV);
    float noise = texture(noise_texture, UV).r;

    if (noise < dissolve) {
        discard;
    }

    float edge = smoothstep(dissolve, dissolve + 0.05, noise);
    base.rgb = mix(edge_color.rgb, base.rgb, edge);
    COLOR = base;
}
```

死亡时把 `dissolve` 从 0 推到 1:

```gdscript
tween.tween_property(material, "shader_parameter/dissolve", 1.0, 0.5)
```

不要在 shader 里每像素算随机噪声。用 `NoiseTexture2D` 或预生成噪声图。

---

## 五、水波 UV 偏移

```glsl
shader_type canvas_item;

uniform float strength = 0.01;
uniform float speed = 3.0;
uniform float frequency = 24.0;

void fragment() {
    vec2 uv = UV;
    uv.x += sin((UV.y + TIME * speed) * frequency) * strength;
    COLOR = texture(TEXTURE, uv);
}
```

适合水面、热浪、传送门。别用在像素字体或 UI 上,文字会糊。

---

## 六、屏幕纹理写法

Godot 4 旧教程里常见:

```glsl
texture(SCREEN_TEXTURE, SCREEN_UV)
```

4.x 要写:

```glsl
shader_type canvas_item;

uniform sampler2D screen_texture : hint_screen_texture, filter_linear_mipmap;

void fragment() {
    COLOR = texture(screen_texture, SCREEN_UV);
}
```

看到 `SCREEN_TEXTURE` 直接按旧教程处理。

---

## 七、参数管理

不要每次写字符串散在各处:

```gdscript
const PARAM_FLASH := &"flash_amount"

func set_flash(sprite: CanvasItem, amount: float) -> void:
    var mat := sprite.material as ShaderMaterial
    if mat == null:
        return
    mat.set_shader_parameter(PARAM_FLASH, amount)
```

如果很多对象共用一个 shader,要清楚:

```text
共享 material: 参数一起变
复制 material: 每个对象单独变,但可能打断 batching
instance shader parameter: 单独参数,更适合大量对象
```

---

## 验收

- 闪白、描边、溶解至少各能跑一个最小示例。
- shader 不写复杂随机函数,噪声用纹理。
- Godot 4 项目里不用 `SCREEN_TEXTURE`。
- 同类对象尽量共享 shader 和 material。
- 知道哪些参数是全局 material 参数,哪些需要实例化。

---

## 常见坑

**坑 1:每个敌人复制一份 material。**

方便但可能打断批处理。大量对象先考虑 instance shader parameter。

**坑 2:描边采样太多。**

8 方向、16 方向描边都更贵。先用 4 方向。

**坑 3:shader 用在 UI 字体上。**

波纹、扭曲会影响可读性。UI 特效要克制。

**坑 4:discard 以为省性能。**

GPU 仍然跑到 discard 那一行。它是视觉裁剪,不是免费优化。

---

下一篇讲程序化关卡与可控随机。
