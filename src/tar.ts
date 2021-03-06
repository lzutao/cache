import * as core from "@actions/core";
import { exec } from "@actions/exec";
import * as io from "@actions/io";
import { existsSync, writeFileSync } from "fs";
import * as path from "path";

import { CacheFilename } from "./constants";

export async function isGnuTar(): Promise<boolean> {
    core.debug("Checking tar --version");
    let versionOutput = "";
    await exec("tar --version", [], {
        ignoreReturnCode: true,
        silent: true,
        listeners: {
            stdout: (data: Buffer): string =>
                (versionOutput += data.toString()),
            stderr: (data: Buffer): string => (versionOutput += data.toString())
        }
    });

    core.debug(versionOutput.trim());
    return versionOutput.toUpperCase().includes("GNU TAR");
}

async function getTarPath(args: string[]): Promise<string> {
    // Explicitly use BSD Tar on Windows
    const IS_WINDOWS = process.platform === "win32";
    if (IS_WINDOWS) {
        const systemTar = `${process.env["windir"]}\\System32\\tar.exe`;
        if (existsSync(systemTar)) {
            return systemTar;
        } else if (isGnuTar()) {
            args.push("--force-local");
        }
    }
    return await io.which("tar", true);
}

async function execTar(args: string[], cwd?: string): Promise<void> {
    try {
        await exec(`"${await getTarPath(args)}"`, args, { cwd: cwd });
    } catch (error) {
        throw new Error(`Tar failed with error: ${error?.message}`);
    }
}

function getWorkingDirectory(): string {
    return process.env["GITHUB_WORKSPACE"] ?? process.cwd();
}

export async function extractTar(archivePath: string): Promise<void> {
    // Create directory to extract tar into
    const workingDirectory = getWorkingDirectory();
    await io.mkdirP(workingDirectory);
    const args = [
        "-xz",
        "-f",
        archivePath.replace(new RegExp("\\" + path.sep, "g"), "/"),
        "-P",
        "-C",
        workingDirectory.replace(new RegExp("\\" + path.sep, "g"), "/")
    ];
    await execTar(args);
}

export async function createTar(
    archiveFolder: string,
    sourceDirectories: string[]
): Promise<void> {
    // Write source directories to manifest.txt to avoid command length limits
    const manifestFilename = "manifest.txt";
    writeFileSync(
        path.join(archiveFolder, manifestFilename),
        sourceDirectories.join("\n")
    );

    const workingDirectory = getWorkingDirectory();
    const args = [
        "-cz",
        "-f",
        CacheFilename.replace(new RegExp("\\" + path.sep, "g"), "/"),
        "-P",
        "-C",
        workingDirectory.replace(new RegExp("\\" + path.sep, "g"), "/"),
        "--files-from",
        manifestFilename
    ];
    await execTar(args, archiveFolder);
}
