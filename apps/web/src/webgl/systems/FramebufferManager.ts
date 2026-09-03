function initFboTexture(
  gl: WebGL2RenderingContext,
  texture: WebGLTexture,
  width: number,
  height: number
): void {
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
}

export class FramebufferManager {
  private gl: WebGL2RenderingContext;

  private lightFBO: WebGLFramebuffer | null = null;
  private lightTexture: WebGLTexture | null = null;
  private fboWidth = 0;
  private fboHeight = 0;

  private sceneFBO: WebGLFramebuffer | null = null;
  private sceneTexture: WebGLTexture | null = null;
  private sceneWidth = 0;
  private sceneHeight = 0;

  private fowFBO: WebGLFramebuffer | null = null;
  private fowTexture: WebGLTexture | null = null;
  public readonly fowWidth = 1200;
  public readonly fowHeight = 800;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
  }

  // fallow-ignore-next-line complexity
  public ensureLightFBO(
    width: number,
    height: number
  ): { fbo: WebGLFramebuffer; texture: WebGLTexture } {
    const gl = this.gl;
    if (
      this.fboWidth === width &&
      this.fboHeight === height &&
      this.lightFBO &&
      this.lightTexture
    ) {
      return { fbo: this.lightFBO, texture: this.lightTexture };
    }
    this.fboWidth = width;
    this.fboHeight = height;

    if (!this.lightTexture) {
      this.lightTexture = gl.createTexture();
    }
    initFboTexture(gl, this.lightTexture!, width, height);

    if (!this.lightFBO) {
      this.lightFBO = gl.createFramebuffer();
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.lightFBO);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.lightTexture,
      0
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { fbo: this.lightFBO!, texture: this.lightTexture! };
  }

  // fallow-ignore-next-line complexity
  public ensureSceneFBO(
    width: number,
    height: number
  ): { fbo: WebGLFramebuffer; texture: WebGLTexture } {
    const gl = this.gl;
    if (
      this.sceneWidth === width &&
      this.sceneHeight === height &&
      this.sceneFBO &&
      this.sceneTexture
    ) {
      return { fbo: this.sceneFBO, texture: this.sceneTexture };
    }
    this.sceneWidth = width;
    this.sceneHeight = height;

    if (!this.sceneTexture) {
      this.sceneTexture = gl.createTexture();
    }
    initFboTexture(gl, this.sceneTexture!, width, height);

    if (!this.sceneFBO) {
      this.sceneFBO = gl.createFramebuffer();
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.sceneFBO);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.sceneTexture,
      0
    );
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { fbo: this.sceneFBO!, texture: this.sceneTexture! };
  }

  public ensureFowFBO(): { fbo: WebGLFramebuffer; texture: WebGLTexture } {
    const gl = this.gl;
    if (this.fowFBO && this.fowTexture) {
      return { fbo: this.fowFBO, texture: this.fowTexture };
    }

    this.fowTexture = gl.createTexture();
    initFboTexture(gl, this.fowTexture!, this.fowWidth, this.fowHeight);

    this.fowFBO = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fowFBO);
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      this.fowTexture,
      0
    );

    gl.viewport(0, 0, this.fowWidth, this.fowHeight);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    return { fbo: this.fowFBO!, texture: this.fowTexture! };
  }

  public resetFogOfWar(): void {
    if (!this.fowFBO) return;
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fowFBO);
    gl.viewport(0, 0, this.fowWidth, this.fowHeight);
    gl.clearColor(0.0, 0.0, 0.0, 1.0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  public getLightTexture(): WebGLTexture | null {
    return this.lightTexture;
  }

  public getSceneTexture(): WebGLTexture | null {
    return this.sceneTexture;
  }

  public getFowTexture(): WebGLTexture | null {
    return this.fowTexture;
  }

  // fallow-ignore-next-line complexity
  public dispose(): void {
    const gl = this.gl;
    if (this.lightFBO) gl.deleteFramebuffer(this.lightFBO);
    if (this.lightTexture) gl.deleteTexture(this.lightTexture);
    if (this.sceneFBO) gl.deleteFramebuffer(this.sceneFBO);
    if (this.sceneTexture) gl.deleteTexture(this.sceneTexture);
    if (this.fowFBO) gl.deleteFramebuffer(this.fowFBO);
    if (this.fowTexture) gl.deleteTexture(this.fowTexture);
  }
}
