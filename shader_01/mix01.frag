#version 300 es
precision highp float;

out vec4 fragColor;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

void main() {
    vec2 pos = gl_FragCoord.xy / u_resolution.xy;
    // vec2 mouse_pos = u_mouse.xy / u_resolution.xy;

    vec3 RED = vec3(1.0, 0.0, 0.0);
    vec3 BLUE = vec3(0.9569, 0.9608, 0.6941);
    vec3 col = mix(RED, BLUE, pos.y);
    // vec3 col = mix(RED, BLUE, mouse_pos.x);

    fragColor = vec4(col ,1.0);
}