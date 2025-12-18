declare module 'gtts'
{
    import { Readable } from 'stream';

    export default class GTTS
    {
        constructor(text: string, lang?: string);

        save(
            filepath: string,
            callback: () => void
        ): void;

        stream(): Readable;
    }
}
