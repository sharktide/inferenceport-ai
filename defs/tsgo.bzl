def _tsgo_impl(ctx):
    out_dir = ctx.actions.declare_directory(ctx.label.name + "_out")
    ctx.actions.run_shell(
        inputs = ctx.files.srcs + [ctx.file.tsconfig], outputs = [out_dir],
        command = "npx tsgo --project {tsconfig} --outDir {out}".format(
            tsconfig = ctx.file.tsconfig.path,
            out = out_dir.path,
        ),
        progress_message = "Transpiling TypeScript with tsgo", )

    return DefaultInfo(files = depset([out_dir]))

tsgo_project = rule(
    implementation = _tsgo_impl,
    attrs = {
        "srcs": attr.label_list(allow_files = [".ts", ".cts", ".mts"]),
        "tsconfig": attr.label(allow_single_file = True),
    },
)
