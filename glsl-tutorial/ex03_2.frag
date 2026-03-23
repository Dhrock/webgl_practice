# ifdef GL_ES
precision mediump float;
# endif

#define PI 3.14159265

uniform vec2 u_resolution;
uniform float u_time;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;

  float t = uv.x * PI * 10.0;

  float grad = sin(t) * sin(u_time);

  gl_FragColor = vec4(vec3(grad), 1.0);
}
