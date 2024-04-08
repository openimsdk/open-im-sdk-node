import { CbEvents, getSDK as WasmGetSDK } from 'open-im-sdk-wasm';
import { MessageItem, WsResponse } from 'open-im-sdk-wasm/lib/types/entity';
import {
  WasmPathConfig,
  InitAndLoginConfig,
} from 'open-im-sdk-wasm/lib/types/params';
import Emitter from './utils/emitter';
import {
  InitConfig,
  FileMsgByPathParams,
  SoundMsgByPathParams,
  VideoMsgByPathParams,
} from './types/params';

type EmitterEvents = {
  [key in CbEvents]: any;
};

type WasmInterface = ReturnType<typeof WasmGetSDK>;

type IMSDKInterface = Omit<WasmInterface, 'login'> & {
  login: (
    params: Partial<InitAndLoginConfig>,
    operationID?: string
  ) => Promise<WsResponse>;
  /**
   * @access only for electron
   */
  initSDK: (param: InitConfig, opid?: string) => Promise<boolean>;
  /**
   * @access only for electron
   */
  createImageMessage: (
    imagePath: string,
    opid?: string
  ) => Promise<WsResponse<MessageItem>>;
  /**
   * @access only for electron
   */
  createImageMessageFromFullPath: (
    imagePath: string,
    opid?: string
  ) => Promise<WsResponse<MessageItem>>;
  /**
   * @access only for electron
   */
  createVideoMessage: (
    params: VideoMsgByPathParams,
    opid?: string
  ) => Promise<WsResponse<MessageItem>>;
  /**
   * @access only for electron
   */
  createVideoMessageFromFullPath: (
    params: VideoMsgByPathParams,
    opid?: string
  ) => Promise<WsResponse<MessageItem>>;
  /**
   * @access only for electron
   */
  createSoundMessage: (
    params: SoundMsgByPathParams,
    opid?: string
  ) => Promise<WsResponse<MessageItem>>;
  /**
   * @access only for electron
   */
  createSoundMessageFromFullPath: (
    params: SoundMsgByPathParams,
    opid?: string
  ) => Promise<WsResponse<MessageItem>>;
  /**
   * @access only for electron
   */
  createFileMessage: (
    params: FileMsgByPathParams,
    opid?: string
  ) => Promise<WsResponse<MessageItem>>;
  /**
   * @access only for electron
   */
  createFileMessageFromFullPath: (
    params: FileMsgByPathParams,
    opid?: string
  ) => Promise<WsResponse<MessageItem>>;
};

type ElectronInvoke = (method: string, ...args: any[]) => Promise<WsResponse>;

type CreateElectronOptions = {
  wasmConfig?: WasmPathConfig;
  invoke?: ElectronInvoke;
};

let wasmSDK: IMSDKInterface | undefined;
const sdkEmitter = new Emitter();

// eslint-disable-next-line
const methodCache = new WeakMap<Function, any>();

async function createWasmSDK(wasmConfig?: WasmPathConfig): Promise<void> {
  if (!wasmSDK) {
    const { getSDK } = await import('open-im-sdk-wasm');
    wasmSDK = getSDK(wasmConfig) as unknown as IMSDKInterface;
  }
}

export function getWithRenderProcess({
  wasmConfig,
  invoke,
}: CreateElectronOptions) {
  const subscribeCallback = (event: keyof EmitterEvents, data: any) =>
    sdkEmitter.emit(event, data);

  const sdkProxyHandler: ProxyHandler<IMSDKInterface> = {
    get(_, prop: keyof IMSDKInterface) {
      return async (...args: any[]) => {
        try {
          if (!invoke) {
            await createWasmSDK(wasmConfig);
            if (!wasmSDK) throw new Error('WASM SDK is not available');
            const cachedMethod = methodCache.get(wasmSDK[prop]);
            if (cachedMethod) {
              // eslint-disable-next-line
              return cachedMethod(...args);
            }
            // @ts-ignore
            const method = async (...args: any[]) => wasmSDK![prop](...args);
            methodCache.set(wasmSDK[prop], method);
            return method(...args);
          }

          if (!subscribeCallback) {
            console.warn('No subscribeCallback method provided');
          }

          if (prop === 'on' || prop === 'off') {
            // @ts-ignore
            return sdkEmitter[prop](...args);
          }

          const result = await invoke(prop, ...args);
          if (result?.errCode) {
            throw result;
          }
          return result;
        } catch (error) {
          console.error(`Error invoking ${prop}:`, error);
          throw error;
        }
      };
    },
  };

  return {
    subscribeCallback,
    proxy: new Proxy({} as IMSDKInterface, sdkProxyHandler),
  };
}
