export const FONTTOOLS_VARIABLE_FONT_PYTHON = `
import traceback
from fontTools.varLib import build


def kumiko_build_variable_font(designspace_path, output_path):
    try:
        font, _, _ = build(designspace_path)
        font.save(output_path)

        return {
            "ok": True,
            "message": "fontTools built a variable font.",
            "tables": sorted(font.keys()),
        }
    except Exception as error:
        return {
            "ok": False,
            "message": str(error),
            "rawCompilerOutput": traceback.format_exc(),
        }
`
