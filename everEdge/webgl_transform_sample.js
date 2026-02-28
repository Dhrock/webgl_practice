// ===== WebGLのユーティリティ関数をまとめたクラス =====
class WebGLUtils {

  // 指定したURLからシェーダーのソースコード（テキスト）を非同期で読み込む
  static async loadShaderSource(url) {
    const response = await fetch(url);
    // HTTPエラーがあれば例外を投げる
    if (!response.ok) {
      throw new Error(`シェーダーソースの読み込みに失敗しました: ${url}`);
    }
    return await response.text();
  }

  // シェーダーソースをコンパイルしてWebGLShaderオブジェクトを返す
  // type: gl.VERTEX_SHADER または gl.FRAGMENT_SHADER
  static compileShader(gl, source, type) {
    // シェーダーオブジェクトを生成
    const shader = gl.createShader(type);
    if (!shader) {
      throw new Error("シェーダーを作成できませんでした");
    }

    // ソースコードをシェーダーにセットしてコンパイル
    gl.shaderSource(shader, source);
    gl.compileShader(shader);

    // コンパイル失敗時はエラーログを取得して例外を投げる
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const error = gl.getShaderInfoLog(shader);
      gl.deleteShader(shader); // 失敗したシェーダーは削除
      throw new Error(`シェーダーのコンパイルに失敗しました: ${error}`);
    }

    return shader;
  }

  // 頂点シェーダーとフラグメントシェーダーをリンクしてWebGLProgramを作成する
  static createProgram(gl, vertexShaderSource, fragmentShaderSource) {
    // 各シェーダーをコンパイル
    const vertexShader = this.compileShader(gl, vertexShaderSource, gl.VERTEX_SHADER);
    const fragmentShader = this.compileShader(gl, fragmentShaderSource, gl.FRAGMENT_SHADER);

    // プログラムオブジェクトを生成
    const program = gl.createProgram();
    if (!program) {
      throw new Error("WebGLプログラムを作成できませんでした");
    }

    // シェーダーをプログラムにアタッチしてリンク
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    // リンク失敗時はエラーログを取得して例外を投げる
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const error = gl.getProgramInfoLog(program);
      gl.deleteProgram(program); // 失敗したプログラムは削除
      throw new Error(`プログラムのリンクに失敗しました: ${error}`);
    }

    return program;
  }

  // HTMLImageElementからWebGLテクスチャを生成して返す
  static createTexture(gl, image) {
    // テクスチャオブジェクトを生成
    const texture = gl.createTexture();
    if (!texture) {
      throw new Error("テクスチャを作成できませんでした");
    }

    // TEXTURE_2Dとしてバインドし、画像データをGPUへ転送
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

    // テクスチャのUV座標が範囲外になった場合はエッジの色でクランプ
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    // 縮小・拡大時のフィルタリングはどちらも線形補間（LINEAR）を使用
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    return texture;
  }

  // キャンバスのCSS表示サイズとWebGLの描画バッファサイズを同期させる
  static resizeCanvas(canvas, gl) {
    const displayWidth = canvas.clientWidth;
    const displayHeight = canvas.clientHeight;

    // サイズが一致していない場合のみリサイズ処理を行う
    if (canvas.width !== displayWidth || canvas.height !== displayHeight) {
      canvas.width = displayWidth;
      canvas.height = displayHeight;
      // WebGLのビューポートも新しいサイズに合わせる
      gl.viewport(0, 0, displayWidth, displayHeight);
    }
  }
}

// ===== 画像スライダーのメインクラス =====
class SliderApp {
  constructor(canvas, imagePaths, displacementPath) {
    // 描画対象のcanvas要素
    this.canvas = canvas;
    // ロードしたHTMLImageElementの配列
    this.images = [];
    // コンパイル済みWebGLプログラム
    this.program = null;
    // 各画像のWebGLテクスチャ配列
    this.textures = [];
    // 変位マップ（ディスプレイスメント）テクスチャ
    this.displacement = null;
    // 頂点属性をまとめるVAO（Vertex Array Object）
    this.vao = null;

    // requestAnimationFrameのIDを保持（キャンセル用）
    this.animationId = 0;
    // トランジション1回あたりの時間（ミリ秒）
    this.transitionDuration = 2100;
    // 次のトランジション開始までのインターバル（ミリ秒）
    this.loopInterval = 5000;
    // 変位マップの適用強度（大きいほど歪みが強くなる）
    this.intensity = 0.2;
    // 現在表示中の画像インデックス
    this.currentIndex = 0;
    // 次に表示する画像インデックス
    this.nextIndex = 1;
    // トランジションの進行度（0.0〜1.0）
    this.progress = 0;
    // トランジション中かどうかのフラグ
    this.isTransitioning = false;

    // WebGL2コンテキストを取得
    const gl = this.canvas.getContext("webgl2");
    if (!gl) {
      throw new Error("WebGL 2.0 is not supported");
    }
    this.gl = gl;

    // 非同期で初期化を開始（エラーはコンソールに出力）
    this.init(imagePaths, displacementPath).catch((err) => {
      console.error("Initialization failed: ", err);
    });
  }

  // シェーダーの読み込み・プログラム作成・バッファセットアップ・テクスチャ読み込みを行う
  async init(imagePaths, displacementPath) {
    // 頂点シェーダーとフラグメントシェーダーを並列で読み込む
    const [vertexShaderSource, fragmentShaderSource] = await Promise.all([
      WebGLUtils.loadShaderSource("./wp-content/themes/theme/assets/shader/vertexShader.vert"),
      WebGLUtils.loadShaderSource("./wp-content/themes/theme/assets/shader/fragmentShader.frag"),
    ]);

    // シェーダーをコンパイル・リンクしてWebGLProgramを作成
    this.program = WebGLUtils.createProgram(this.gl, vertexShaderSource, fragmentShaderSource);

    // 頂点バッファとテクスチャ座標バッファをセットアップ
    this.setupBuffers();

    // 変位マップと各スライド画像を並行して読み込む
    this.loadDisplacementMap(displacementPath);
    this.loadImages(imagePaths);
  }

  // VAOに頂点座標とテクスチャ座標のバッファを登録する
  setupBuffers() {
    if (!this.program) return;

    const gl = this.gl;

    // VAOを作成してバインド（以降の属性設定がこのVAOに記録される）
    this.vao = gl.createVertexArray();
    gl.bindVertexArray(this.vao);

    // バッファを作成してシェーダーの attribute 変数に紐付けるヘルパー関数
    const setupPositionBuffer = (program, positionArray, locationName) => {
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      // Float32Arrayに変換してGPUへデータを転送（STATIC_DRAW: 変更なし）
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positionArray), gl.STATIC_DRAW);

      // シェーダー内の attribute 変数の位置を取得して有効化
      const location = gl.getAttribLocation(program, locationName);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(location);
      // 2要素のfloat型としてデータを読み取るよう指定
      gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
    };

    // 画面全体を覆うクワッド（2つの三角形）の頂点座標（クリップ座標系）
    // TRIANGLE_STRIPで描くため左下→右下→左上→右上の順
    const positions = [-1.0, -1.0, 1.0, -1.0, -1.0, 1.0, 1.0, 1.0];
    setupPositionBuffer(this.program, positions, "a_position");

    // 対応するテクスチャUV座標（Y軸はWebGLとCanvas座標が逆なので反転）
    const texCoords = [0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 1.0, 0.0];
    setupPositionBuffer(this.program, texCoords, "a_texCoord");

    // VAOのバインドを解除（他の描画処理に影響しないように）
    gl.bindVertexArray(null);
  }

  // 変位マップ画像を読み込んでテクスチャとして登録する
  loadDisplacementMap(displacementPath) {
    const displacementImage = new Image();
    // クロスオリジン画像を許可（CORSヘッダーが必要な場合に対応）
    displacementImage.crossOrigin = "anonymous";

    // 読み込み完了後にWebGLテクスチャを生成して保持
    displacementImage.onload = () => {
      this.displacement = WebGLUtils.createTexture(this.gl, displacementImage);
    };

    displacementImage.onerror = () => {
      console.error(`Displacement map loading failed: ${displacementPath}`);
    };

    displacementImage.src = displacementPath;
  }

  // スライド用の画像を全て読み込み、完了後に初期レンダリングを行う
  loadImages(imagePaths) {
    // スライダーには最低2枚の画像が必要
    if (imagePaths.length < 2) {
      throw new Error("At least 2 images are required");
    }

    // 読み込み完了した画像の枚数を追跡するカウンター
    let loadedCount = 0;

    imagePaths.forEach((path, index) => {
      const image = new Image();
      image.crossOrigin = "anonymous";

      image.onload = () => {
        // 読み込んだ画像をWebGLテクスチャに変換して配列に格納
        this.textures[index] = WebGLUtils.createTexture(this.gl, image);
        loadedCount++;
        // 全画像の読み込みが完了したら最初のフレームを描画する
        if (loadedCount === imagePaths.length) {
          this.render();
        }
      };

      image.onerror = () => {
        console.error(`Image loading failed: ${path}`);
      };

      image.src = path;
      this.images.push(image);
    });
  }

  // 現在の状態（progress, currentIndex, nextIndex）をもとに1フレームを描画する
  render() {
    if (!this.program || !this.vao) return;
    const gl = this.gl;

    // 変位マップがまだ読み込まれていない場合は次のフレームで再試行
    if (!this.displacement) {
      requestAnimationFrame(() => this.render());
      return;
    }

    // キャンバスサイズとビューポートを最新の表示サイズに合わせる
    WebGLUtils.resizeCanvas(this.canvas, this.gl);

    // 画面を黒でクリア
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // シェーダープログラムとVAOを使用状態にする
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);

    // シェーダー内の各uniform変数の場所（location）を取得
    const texture1Location    = gl.getUniformLocation(this.program, "u_texture1");
    const texture2Location    = gl.getUniformLocation(this.program, "u_texture2");
    const displacementLocation = gl.getUniformLocation(this.program, "u_displacement");
    const progressLocation    = gl.getUniformLocation(this.program, "u_progress");
    const intensityLocation   = gl.getUniformLocation(this.program, "u_intensity");
    const resolutionLocation  = gl.getUniformLocation(this.program, "u_resolution");

    // テクスチャユニット0：現在表示中の画像
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[this.currentIndex]);
    gl.uniform1i(texture1Location, 0);

    // テクスチャユニット1：次に表示する画像
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textures[this.nextIndex]);
    gl.uniform1i(texture2Location, 1);

    // テクスチャユニット2：変位マップ（トランジション時の歪みに使用）
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.displacement);
    gl.uniform1i(displacementLocation, 2);

    // トランジションの進行度（0.0=現在画像のみ, 1.0=次画像のみ）
    gl.uniform1f(progressLocation, this.progress);
    // 変位マップの歪み強度
    gl.uniform1f(intensityLocation, this.intensity);

    // キャンバスの解像度とアスペクト比をシェーダーに渡す
    const width = this.canvas.width;
    const height = this.canvas.height;
    const aspect = width / height;
    gl.uniform4f(resolutionLocation, width, height, 1.0, 1.0 / aspect);

    // TRIANGLE_STRIPで4頂点（= クワッド1枚 = 画面全体）を描画
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // VAOのバインドを解除
    gl.bindVertexArray(null);
  }

  // 次の画像へのトランジションアニメーションを開始する
  startTransition() {
    // 既にトランジション中の場合は無視
    if (this.isTransitioning) return;

    this.isTransitioning = true;
    this.progress = 0;

    // アニメーション開始時刻を記録
    const startTime = performance.now();

    // rAFループ：毎フレーム経過時間からprogressを計算して描画する
    const animate = (timestamp) => {
      const elapsed = timestamp - startTime;
      // 経過時間を duration で割って 0.0〜1.0 に正規化（1.0を超えないようにclamp）
      this.progress = Math.min(elapsed / this.transitionDuration, 1.0);

      this.render();

      if (this.progress < 1.0) {
        // アニメーション継続
        this.animationId = requestAnimationFrame(animate);
      } else {
        // トランジション完了：インデックスを進めて状態をリセット
        this.currentIndex = this.nextIndex;
        this.nextIndex = (this.nextIndex + 1) % this.textures.length;
        this.progress = 0;
        this.isTransitioning = false;
      }
    };

    this.animationId = requestAnimationFrame(animate);
  }

  // 実行中のトランジションアニメーションを停止する
  stopTransition() {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.isTransitioning = false;
    }
  }

  // 一定間隔でトランジションを繰り返すループを開始する
  loopAnimation() {
    // 即座に最初のトランジションを開始
    this.startTransition();
    // loopInterval ごとにトランジションが完了していれば次を開始
    setInterval(() => {
      if (!this.isTransitioning) {
        this.startTransition();
      }
    }, this.loopInterval);
  }
}
