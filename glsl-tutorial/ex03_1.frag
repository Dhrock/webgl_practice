# ifdef GL_ES
precision mediump float;
# endif

uniform vec2 u_resolution;

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;

  // タイル繰り返し（N×Nのグリッド）
  vec2 tile = fract(uv * 4.0);
  float grad = mix(0.0, 1.0, tile.x); // タイル内の水平グラデーション

  vec2 grid = floor(uv * 10.0); // タイルのグリッド座標
  float check = mod(grid.x + grid.y, 2.0);

  vec3 col = mix(vec3(0.0), vec3(1.0), check); // チェッカーパターン
  
  gl_FragColor = vec4(col, 1.0);
}
