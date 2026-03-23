# ifdef GL_ES
precision mediump float;
# endif

uniform vec2 u_resolution;
uniform vec2 u_mouse;
uniform float u_time;

void main(){
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;

  vec3 color1 = vec3(1.0, 0.0, 0.0);
  vec3 color2 = vec3(0.0, 0.0, 1.0);

  vec3 color = mix(color1, color2, uv.x);

  gl_FragColor = vec4(color, 1.0);
}
