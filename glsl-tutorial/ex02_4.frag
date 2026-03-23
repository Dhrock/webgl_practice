# ifdef GL_ES
precision mediump float;
# endif

uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;

void main(){
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;

  float u_red = 1.0 - (uv.x * 0.5 + uv.y * 0.5);
  float u_blue = uv.x * 0.5 + uv.y * 0.5;

  gl_FragColor = vec4(u_red, 0.0, u_blue, 1.0);
}
