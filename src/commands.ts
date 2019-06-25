"use strict";
import { basename, dirname } from "path";
import * as vscode from "vscode";

export class Commands implements vscode.Disposable {
    private LANGUAGE_NAME  = "Verilog";
    private EXTENTSION_NAME = "verilog";
    private COMPILE_COMMANDS = "iverilog -o {fileName}.out {fileName}";
    private EXECUTE_COMMANDS = "vvp {fileName}.out";

    private outputChannel: vscode.OutputChannel;
    private terminal: vscode.Terminal;
    private config: vscode.WorkspaceConfiguration;
    private document: vscode.TextDocument;
    private cwd: string;
    private isRunning: boolean;
    private isCompiling: boolean;
    private isSuccess: boolean;
    private compileProcess;
    private executeProcess;

    constructor() {
        this.outputChannel = vscode.window.createOutputChannel(this.LANGUAGE_NAME);
        this.terminal = vscode.window.createTerminal(this.LANGUAGE_NAME);
    }

    public async executeCommand(fileUri: vscode.Uri) {
        if (this.isRunning) {
            vscode.window.showInformationMessage("Code is already running!");
            return;
        }

        const editor = vscode.window.activeTextEditor;
        if (fileUri && editor && fileUri.fsPath !== editor.document.uri.fsPath) {
            this.document = await vscode.workspace.openTextDocument(fileUri);
        } else if (editor) {
            this.document = editor.document;
        } else {
            vscode.window.showInformationMessage("No code found or selected.");
            return;
        }

        const fileName = basename(this.document.fileName);
        this.cwd = dirname(this.document.fileName);
        this.config = vscode.workspace.getConfiguration(this.EXTENTSION_NAME);
        const runInTerminal = this.config.get<boolean>("runInTerminal");
        const clearPreviousOutput = this.config.get<boolean>("clearPreviousOutput");
        const preserveFocus = this.config.get<boolean>("preserveFocus");
        if (runInTerminal) {
            this.executeCommandInTerminal(fileName, clearPreviousOutput, preserveFocus);
        } else {
            this.executeCommandInOutputChannel(fileName, clearPreviousOutput, preserveFocus);
        }
    }

    public executeCommandInTerminal(fileName: string, clearPreviousOutput, preserveFocus): void {
        if (clearPreviousOutput) {
            vscode.commands.executeCommand("workbench.action.terminal.clear");
        }
        this.terminal.show(preserveFocus);
        this.terminal.sendText(`cd "${this.cwd}"`);
        this.terminal.sendText(this.COMPILE_COMMANDS.replace(/{fileName}/g, fileName));
        this.terminal.sendText(this.EXECUTE_COMMANDS.replace(/{fileName}/g, fileName));
    }

    public executeCommandInOutputChannel(fileName: string, clearPreviousOutput, preserveFocus): void {
        if (clearPreviousOutput) {
            this.outputChannel.clear();
        }
        this.isRunning = true;
        this.isCompiling = true;
        this.isSuccess = true;
        this.outputChannel.show(preserveFocus);
        this.outputChannel.appendLine(`[Running] ${basename(fileName)}`);
        const exec = require("child_process").exec;
        const startTime = new Date();
        this.compileProcess = exec(this.COMPILE_COMMANDS.replace(/{fileName}/g, fileName), { cwd: this.cwd });

        this.compileProcess.stdout.on("data", (data) => {
            this.outputChannel.append(data);
            if (data.match("I give up.")) {
                this.isSuccess = false;
            }
        });

        this.compileProcess.stderr.on("data", (data) => {
            this.outputChannel.append(data);
            this.isSuccess = false;
        });

        this.compileProcess.on("close", (compileCode) => {
            this.isCompiling = false;

            if (this.isSuccess) {

                this.executeProcess = exec(this.EXECUTE_COMMANDS.replace(/{fileName}/g, fileName), { cwd: this.cwd });
                this.executeProcess.stdout.on("data", (data) => {
                    this.outputChannel.append(data);
                });
                this.executeProcess.stderr.on("data", (data) => {
                    this.outputChannel.append(data);
                });
                this.executeProcess.on("close", (executeCode) => {
                    this.isRunning = false;
                    const endTime = new Date();
                    const elapsedTime = (endTime.getTime() - startTime.getTime()) / 1000;
                    this.outputChannel.appendLine(`[Done] exit with code=${executeCode} in ${elapsedTime} seconds`);
                    this.outputChannel.appendLine("");
                });
            } else {
                this.isRunning = false;
                this.outputChannel.appendLine(`[Compile Failed]`);
                this.outputChannel.appendLine("");
            }
        });
    }

    public stopCommand() {
        if (this.isRunning) {
            this.isRunning = false;
            const kill = require("tree-kill");
            if (this.isCompiling) {
                this.isCompiling = false;
                kill(this.compileProcess.pid);
            } else {
                kill(this.executeProcess.pid);
            }
        }
    }

    public dispose() {
        this.stopCommand();
    }
}
