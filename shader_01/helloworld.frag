#version 300 es
precision highp float;

out vec4 fragColor;
uniform vec2 u_resolution;
uniform float u_time;

void main() {
    float time = u_time;
    
    vec2 pos = gl_FragCoord.xy / u_resolution.xy;
    fragColor = vec4(abs(sin(time)), abs(cos(time)), pos);
}