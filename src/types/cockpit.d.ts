export interface SpawnOptions {
    err?: 'out' | 'ignore' | 'message';
    environ?: string[];
    directory?: string;
    superuser?: 'require' | 'try';
    binary?: boolean;
    pty?: boolean;
}

export interface SpawnProcess extends Promise<string> {
    stream(callback: (data: string) => void): SpawnProcess;
    input(data: string, stream?: boolean): void;
    close(problem?: string): void;
}

export interface UserInfo {
    name: string;
    full_name: string;
    home: string;
    shell: string;
    id: number;
    groups: string[];
}

export interface CockpitAPI {
    spawn(command: string[], options?: SpawnOptions): SpawnProcess;
    file(path: string, options?: { superuser?: 'require' | 'try'; syntax?: unknown }): {
        read(): Promise<string | null>;
        replace(content: string): Promise<string>;
        close(): void;
    };
    user(): Promise<UserInfo>;
    gettext(text: string): string;
    format(template: string, args: Record<string, string | number> | (string | number)[]): string;
    format_bytes(bytes: number, options?: { base2?: boolean; precision?: number }): string;
    jump(location: string, host?: string): void;
    translate(): void;
}

declare const cockpit: CockpitAPI;
export default cockpit;
