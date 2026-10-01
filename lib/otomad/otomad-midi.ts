// 音MAD の MIDI 書き出し。設計: docs/otomad-feature-design.md §6
//
// MML（parseMvSong の音符）を dtm の exportMIDI に戻す。各 MML トラック = MIDI トラック。
// 所有者環境の AviUtl（音MAD五線譜 = MIDIFileReader）や RPPtoEXO にそのまま読ませる用。

import type { MvSong } from "@/lib/mv/mv-engine";
import { MV_STEPS_PER_BAR } from "@/lib/mv/mv-config";

export const buildOtomadMidi = async (song: MvSong): Promise<Blob> => {
	const dtm = await import("@onjmin/dtm");
	const tracks = song.tracks.map((trackId) => {
		const notes = (song.byTrack.get(trackId) ?? []).map((n, i) => ({
			id: i + 1,
			startStep: n.startStep,
			durationSteps: n.durationSteps,
			pitchUnits: dtm.units(Math.round(n.pitch * dtm.UNITS_PER_SEMITONE)),
			velocity: n.velocity,
		}));
		return { notes, volume: 100 };
	});
	return dtm.exportMIDI({ tracks, bpm: song.bpm, stepsPerBar: MV_STEPS_PER_BAR });
};

export const downloadBlob = (blob: Blob, filename: string): void => {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = filename;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 1000);
};
