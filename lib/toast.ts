export type ToastType = "success" | "error" | "info";

export interface ToastMessage {
	id: string;
	type: ToastType;
	message: string;
	duration?: number;
}

type ToastListener = (toast: ToastMessage) => void;
const toastListeners = new Set<ToastListener>();

export function subscribeToast(listener: ToastListener) {
	toastListeners.add(listener);
	return () => {
		toastListeners.delete(listener);
	};
}

export function showToast(
	type: ToastType,
	message: string,
	options?: { id?: string; duration?: number },
) {
	const toastId =
		options?.id || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	const toast: ToastMessage = {
		id: toastId,
		type,
		message,
		duration: options?.duration,
	};
	toastListeners.forEach((listener) => listener(toast));
	return toastId;
}

type HeartBurstListener = () => void;
const heartBurstListeners = new Set<HeartBurstListener>();

export function subscribeHeartBurst(listener: HeartBurstListener) {
	heartBurstListeners.add(listener);
	return () => {
		heartBurstListeners.delete(listener);
	};
}

export function triggerHeartBurst() {
	heartBurstListeners.forEach((listener) => listener());
}

/** ハートボタンを自分でクリックしたときの、その場から弾け飛ぶ小さなハート演出。 */
type HeartPopListener = (x: number, y: number) => void;
const heartPopListeners = new Set<HeartPopListener>();

export function subscribeHeartPop(listener: HeartPopListener) {
	heartPopListeners.add(listener);
	return () => {
		heartPopListeners.delete(listener);
	};
}

export function triggerHeartPop(x: number, y: number) {
	heartPopListeners.forEach((listener) => listener(x, y));
}
