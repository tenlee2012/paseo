import { useCallback, useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { Alert, Text, TextInput, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import Slider from "@react-native-community/slider";
import { ChevronDown, Monitor, Moon, Sun } from "lucide-react-native";
import {
  SYNTAX_THEME_OPTIONS,
  type SyntaxThemeId,
  type SyntaxThemeOption,
} from "@getpaseo/highlight";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { deleteBackgroundImage, persistBackgroundImage } from "@/background-image/store";
import { useBackgroundImageRuntimeStore } from "@/background-image/runtime-store";
import { useImageAttachmentPicker } from "@/hooks/use-image-attachment-picker";
import { SettingsSection } from "@/screens/settings/settings-section";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  MAX_BACKGROUND_IMAGE_OPACITY,
  MAX_CODE_FONT_SIZE,
  MAX_UI_FONT_SIZE,
  MIN_BACKGROUND_IMAGE_OPACITY,
  MIN_CODE_FONT_SIZE,
  MIN_UI_FONT_SIZE,
  parseBackgroundImageOpacity,
  parseClampedFontSize,
  sanitizeFontFamily,
  useAppSettings,
  type AppSettings,
} from "@/hooks/use-settings";
import {
  DEFAULT_MONO_FONT_STACK,
  DEFAULT_UI_FONT_STACK,
  ICON_SIZE,
  THEME_SWATCHES,
  type Theme,
} from "@/styles/theme";
import { isNative } from "@/constants/platform";
import { settingsStyles } from "@/styles/settings";
import { AppearancePreview } from "./appearance-preview";

// ---------------------------------------------------------------------------
// Theme-reactive leaf icons (withUnistyles + uniProps color mapping — no
// useUnistyles). Icon sizes read the static ICON_SIZE token; the appearance
// feature does not scale icons.
// ---------------------------------------------------------------------------

const ThemedSun = withUnistyles(Sun);
const ThemedMoon = withUnistyles(Moon);
const ThemedMonitor = withUnistyles(Monitor);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedSlider = withUnistyles(Slider);

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const sliderColorMapping = (theme: Theme) => ({
  minimumTrackTintColor: theme.colors.accent,
  maximumTrackTintColor: theme.colors.surface3,
  thumbTintColor: theme.colors.accentBright,
});

function getThemeLabel(t: TFunction, value: AppSettings["theme"]): string {
  const labelKeys: Record<AppSettings["theme"], string> = {
    light: "settings.appearance.theme.options.light",
    dark: "settings.appearance.theme.options.dark",
    zinc: "settings.appearance.theme.options.zinc",
    midnight: "settings.appearance.theme.options.midnight",
    claude: "settings.appearance.theme.options.claude",
    ghostty: "settings.appearance.theme.options.ghostty",
    auto: "settings.appearance.theme.options.auto",
  };
  return t(labelKeys[value]);
}

const PRIMARY_THEMES: readonly AppSettings["theme"][] = ["light", "dark", "auto"];
const DARK_VARIANT_THEMES: readonly AppSettings["theme"][] = [
  "zinc",
  "midnight",
  "claude",
  "ghostty",
];

// Platform default stacks can be the bare native tokens ("normal"/"monospace");
// those read as a bug, so show a human label in the placeholder instead.
const BARE_DEFAULT_STACKS: ReadonlySet<string> = new Set(["normal", "monospace"]);

function resolveDefaultStackPlaceholder(t: TFunction, stack: string): string {
  return BARE_DEFAULT_STACKS.has(stack) ? t("settings.appearance.fonts.systemDefault") : stack;
}

// Local size string (digits only) -> preview override number. Empty/invalid
// yields undefined so the preview falls back to the committed theme value.
function sizeDraftToOverride(value: string): number | undefined {
  if (value.length === 0) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function dropdownTriggerStyle({ pressed }: PressableStateCallbackType) {
  return [styles.trigger, pressed ? styles.triggerPressed : null];
}

// ---------------------------------------------------------------------------
// Theme picker
// ---------------------------------------------------------------------------

interface ThemeLeadingProps {
  themeValue: AppSettings["theme"];
}

function ThemeLeading({ themeValue }: ThemeLeadingProps) {
  switch (themeValue) {
    case "light":
      return <ThemedSun size={ICON_SIZE.md} uniProps={mutedColorMapping} />;
    case "dark":
      return <ThemedMoon size={ICON_SIZE.md} uniProps={mutedColorMapping} />;
    case "auto":
      return <ThemedMonitor size={ICON_SIZE.md} uniProps={mutedColorMapping} />;
    default:
      return <ThemeSwatch color={THEME_SWATCHES[themeValue]} />;
  }
}

interface ThemeSwatchProps {
  color: string;
}

function ThemeSwatch({ color }: ThemeSwatchProps) {
  const swatchStyle = useMemo(() => [styles.swatch, { backgroundColor: color }], [color]);
  return <View style={swatchStyle} />;
}

interface ThemeMenuItemProps {
  themeValue: AppSettings["theme"];
  selected: boolean;
  onChange: (theme: AppSettings["theme"]) => void;
}

function ThemeMenuItem({ themeValue, selected, onChange }: ThemeMenuItemProps) {
  const { t } = useTranslation();
  const handleSelect = useCallback(() => {
    onChange(themeValue);
  }, [onChange, themeValue]);
  const leading = useMemo(() => <ThemeLeading themeValue={themeValue} />, [themeValue]);
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect} leading={leading}>
      {getThemeLabel(t, themeValue)}
    </DropdownMenuItem>
  );
}

interface ThemeRowProps {
  value: AppSettings["theme"];
  onChange: (theme: AppSettings["theme"]) => void;
}

function ThemeRow({ value, onChange }: ThemeRowProps) {
  const { t } = useTranslation();
  const selectedLabel = getThemeLabel(t, value);
  return (
    <View style={settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{t("settings.appearance.theme.title")}</Text>
      </View>
      <DropdownMenu>
        <DropdownMenuTrigger
          style={dropdownTriggerStyle}
          accessibilityLabel={t("settings.appearance.theme.accessibilityLabel", {
            value: selectedLabel,
          })}
        >
          <ThemeLeading themeValue={value} />
          <Text style={styles.triggerText}>{selectedLabel}</Text>
          <ThemedChevronDown size={ICON_SIZE.sm} uniProps={mutedColorMapping} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" width={200}>
          {PRIMARY_THEMES.map((themeValue) => (
            <ThemeMenuItem
              key={themeValue}
              themeValue={themeValue}
              selected={value === themeValue}
              onChange={onChange}
            />
          ))}
          <DropdownMenuSeparator />
          {DARK_VARIANT_THEMES.map((themeValue) => (
            <ThemeMenuItem
              key={themeValue}
              themeValue={themeValue}
              selected={value === themeValue}
              onChange={onChange}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

interface AutoExpandReasoningRowProps {
  value: boolean;
  onChange: (value: boolean) => void;
}

function AutoExpandReasoningRow({ value, onChange }: AutoExpandReasoningRowProps) {
  const { t } = useTranslation();
  return (
    <View style={settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>
          {t("settings.general.autoExpandReasoning.label")}
        </Text>
        <Text style={settingsStyles.rowHint}>
          {t("settings.general.autoExpandReasoning.description")}
        </Text>
      </View>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const TOOL_CALL_DETAIL_LEVELS: readonly AppSettings["toolCallDetailLevel"][] = [
  "detailed",
  "overview",
];

function getToolCallDetailLevelLabel(
  t: TFunction,
  value: AppSettings["toolCallDetailLevel"],
): string {
  return t(`settings.general.toolCallDetail.options.${value}`);
}

interface ToolCallDetailMenuItemProps {
  value: AppSettings["toolCallDetailLevel"];
  selected: boolean;
  onChange: (value: AppSettings["toolCallDetailLevel"]) => void;
}

function ToolCallDetailMenuItem({ value, selected, onChange }: ToolCallDetailMenuItemProps) {
  const { t } = useTranslation();
  const handleSelect = useCallback(() => onChange(value), [onChange, value]);
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect}>
      {getToolCallDetailLevelLabel(t, value)}
    </DropdownMenuItem>
  );
}

interface ToolCallDetailRowProps {
  value: AppSettings["toolCallDetailLevel"];
  onChange: (value: AppSettings["toolCallDetailLevel"]) => void;
}

function ToolCallDetailRow({ value, onChange }: ToolCallDetailRowProps) {
  const { t } = useTranslation();
  const selectedLabel = getToolCallDetailLevelLabel(t, value);
  return (
    <View style={[settingsStyles.row, settingsStyles.rowBorder]}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{t("settings.general.toolCallDetail.label")}</Text>
        <Text style={settingsStyles.rowHint}>
          {t("settings.general.toolCallDetail.description")}
        </Text>
      </View>
      <DropdownMenu>
        <DropdownMenuTrigger
          style={dropdownTriggerStyle}
          accessibilityLabel={t("settings.general.toolCallDetail.accessibilityLabel", {
            value: selectedLabel,
          })}
        >
          <Text style={styles.triggerText}>{selectedLabel}</Text>
          <ThemedChevronDown size={ICON_SIZE.sm} uniProps={mutedColorMapping} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" width={200}>
          {TOOL_CALL_DETAIL_LEVELS.map((option) => (
            <ToolCallDetailMenuItem
              key={option}
              value={option}
              selected={value === option}
              onChange={onChange}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Fonts: family text fields + numeric size fields (commit on blur/submit)
// ---------------------------------------------------------------------------

interface FontFamilyRowProps {
  title: string;
  hint: string;
  accessibilityLabel: string;
  placeholder: string;
  value: string;
  draft: string;
  withBorder: boolean;
  onChangeDraft: (value: string) => void;
  onCommit: (value: string) => void;
}

function FontFamilyRow({
  title,
  hint,
  accessibilityLabel,
  placeholder,
  value,
  draft,
  withBorder,
  onChangeDraft,
  onCommit,
}: FontFamilyRowProps) {
  const handleCommit = useCallback(() => {
    onCommit(draft);
  }, [draft, onCommit]);

  // Resync from the committed value when it changes elsewhere.
  useEffect(() => {
    onChangeDraft(value);
    // Only resync on external value changes, not on local keystrokes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <View style={withBorder ? styles.rowWithBorder : settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{title}</Text>
        <Text style={settingsStyles.rowHint}>{hint}</Text>
      </View>
      <TextInput
        value={draft}
        onChangeText={onChangeDraft}
        onBlur={handleCommit}
        onSubmitEditing={handleCommit}
        placeholder={placeholder}
        placeholderTextColor={styles.placeholderColor.color}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        style={styles.fontFamilyInput}
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}

interface FontSizeRowProps {
  title: string;
  accessibilityLabel: string;
  draft: string;
  withBorder?: boolean;
  onChangeDraft: (value: string) => void;
  onCommit: () => void;
}

function FontSizeRow({
  title,
  accessibilityLabel,
  draft,
  withBorder = true,
  onChangeDraft,
  onCommit,
}: FontSizeRowProps) {
  return (
    <View style={withBorder ? styles.rowWithBorder : settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{title}</Text>
      </View>
      <View style={styles.sizeField}>
        <TextInput
          value={draft}
          onChangeText={onChangeDraft}
          onBlur={onCommit}
          onSubmitEditing={onCommit}
          keyboardType="number-pad"
          inputMode="numeric"
          selectTextOnFocus
          style={styles.sizeInput}
          accessibilityLabel={accessibilityLabel}
        />
        <Text style={styles.unit}>px</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Syntax highlight theme picker (commits immediately)
// ---------------------------------------------------------------------------

function syntaxLabelForId(id: SyntaxThemeId): string {
  const option = SYNTAX_THEME_OPTIONS.find((entry) => entry.id === id);
  return option ? option.label : id;
}

interface SyntaxMenuItemProps {
  option: SyntaxThemeOption;
  selected: boolean;
  onChange: (id: SyntaxThemeId) => void;
}

function SyntaxMenuItem({ option, selected, onChange }: SyntaxMenuItemProps) {
  const handleSelect = useCallback(() => {
    onChange(option.id);
  }, [onChange, option.id]);
  return (
    <DropdownMenuItem selected={selected} onSelect={handleSelect}>
      {option.label}
    </DropdownMenuItem>
  );
}

interface SyntaxRowProps {
  value: SyntaxThemeId;
  onChange: (id: SyntaxThemeId) => void;
}

function SyntaxRow({ value, onChange }: SyntaxRowProps) {
  const { t } = useTranslation();
  const selectedLabel = syntaxLabelForId(value);
  return (
    <View style={settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>
          {t("settings.appearance.syntax.highlightTheme")}
        </Text>
        <Text style={settingsStyles.rowHint}>
          {t("settings.appearance.syntax.highlightThemeHint")}
        </Text>
      </View>
      <DropdownMenu>
        <DropdownMenuTrigger
          style={dropdownTriggerStyle}
          accessibilityLabel={t("settings.appearance.syntax.highlightThemeAccessibility", {
            value: selectedLabel,
          })}
        >
          <Text style={styles.triggerText}>{selectedLabel}</Text>
          <ThemedChevronDown size={ICON_SIZE.sm} uniProps={mutedColorMapping} />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" align="end" width={200}>
          {SYNTAX_THEME_OPTIONS.map((option) => (
            <SyntaxMenuItem
              key={option.id}
              option={option}
              selected={value === option.id}
              onChange={onChange}
            />
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Background image
// ---------------------------------------------------------------------------

interface BackgroundImageRowProps {
  hasBackgroundImage: boolean;
  isSaving: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

function BackgroundImageRow({
  hasBackgroundImage,
  isSaving,
  onSelect,
  onRemove,
}: BackgroundImageRowProps) {
  const { t } = useTranslation();
  return (
    <View style={settingsStyles.row}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{t("settings.appearance.background.image")}</Text>
        <Text style={settingsStyles.rowHint}>
          {t("settings.appearance.background.recommendation")}
        </Text>
      </View>
      <View style={styles.backgroundActions}>
        <Button size="sm" variant="outline" loading={isSaving} onPress={onSelect}>
          {t(
            hasBackgroundImage
              ? "settings.appearance.background.change"
              : "settings.appearance.background.choose",
          )}
        </Button>
        {hasBackgroundImage ? (
          <Button size="sm" variant="ghost" disabled={isSaving} onPress={onRemove}>
            {t("settings.appearance.background.remove")}
          </Button>
        ) : null}
      </View>
    </View>
  );
}

interface BackgroundImageOpacityRowProps {
  value: number;
  onValueChange: (value: number) => void;
  onSlidingComplete: (value: number) => void;
}

function BackgroundImageOpacityRow({
  value,
  onValueChange,
  onSlidingComplete,
}: BackgroundImageOpacityRowProps) {
  const { t } = useTranslation();
  const accessibilityValue = useMemo(
    () => ({
      min: MIN_BACKGROUND_IMAGE_OPACITY,
      max: MAX_BACKGROUND_IMAGE_OPACITY,
      now: value,
      text: `${Math.round(value)}%`,
    }),
    [value],
  );
  return (
    <View style={styles.rowWithBorder}>
      <View style={settingsStyles.rowContent}>
        <Text style={settingsStyles.rowTitle}>{t("settings.appearance.background.opacity")}</Text>
        <Text style={settingsStyles.rowHint}>
          {t("settings.appearance.background.opacityHint")}
        </Text>
      </View>
      <View style={styles.opacityControl}>
        <ThemedSlider
          value={value}
          minimumValue={MIN_BACKGROUND_IMAGE_OPACITY}
          maximumValue={MAX_BACKGROUND_IMAGE_OPACITY}
          step={1}
          onValueChange={onValueChange}
          onSlidingComplete={onSlidingComplete}
          tapToSeek
          style={styles.opacitySlider}
          testID="background-image-opacity-slider"
          accessibilityLabel={t("settings.appearance.background.opacityAccessibility")}
          accessibilityValue={accessibilityValue}
          uniProps={sliderColorMapping}
        />
        <Text style={styles.opacityValue}>{Math.round(value)}%</Text>
      </View>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export function AppearanceSection() {
  const { t } = useTranslation();
  const { settings, updateSettings } = useAppSettings();
  const { pickImage } = useImageAttachmentPicker();
  const showFontFamilyRows = !isNative;
  const uiFontPlaceholder = resolveDefaultStackPlaceholder(t, DEFAULT_UI_FONT_STACK);
  const monoFontPlaceholder = resolveDefaultStackPlaceholder(t, DEFAULT_MONO_FONT_STACK);

  const [uiFontDraft, setUiFontDraft] = useState(settings.uiFontFamily);
  const [monoFontDraft, setMonoFontDraft] = useState(settings.monoFontFamily);
  const [uiSizeDraft, setUiSizeDraft] = useState(String(settings.uiFontSize));
  const [codeSizeDraft, setCodeSizeDraft] = useState(String(settings.codeFontSize));
  const [backgroundImageOpacityPreview, setBackgroundImageOpacityPreview] = useState(
    settings.backgroundImageOpacity,
  );
  const [isSavingBackgroundImage, setIsSavingBackgroundImage] = useState(false);
  const setRuntimePreviewOpacity = useBackgroundImageRuntimeStore(
    (state) => state.setPreviewOpacity,
  );

  // Resync numeric drafts when the committed value changes elsewhere.
  useEffect(() => {
    setUiSizeDraft(String(settings.uiFontSize));
  }, [settings.uiFontSize]);
  useEffect(() => {
    setCodeSizeDraft(String(settings.codeFontSize));
  }, [settings.codeFontSize]);
  useEffect(() => {
    setBackgroundImageOpacityPreview(settings.backgroundImageOpacity);
  }, [settings.backgroundImageOpacity]);

  const handleThemeChange = useCallback(
    (theme: AppSettings["theme"]) => {
      void updateSettings({ theme });
    },
    [updateSettings],
  );

  const handleSyntaxThemeChange = useCallback(
    (syntaxTheme: SyntaxThemeId) => {
      void updateSettings({ syntaxTheme });
    },
    [updateSettings],
  );

  const handleAutoExpandReasoningChange = useCallback(
    (autoExpandReasoning: boolean) => {
      void updateSettings({ autoExpandReasoning });
    },
    [updateSettings],
  );

  const handleToolCallDetailLevelChange = useCallback(
    (toolCallDetailLevel: AppSettings["toolCallDetailLevel"]) => {
      void updateSettings({ toolCallDetailLevel });
    },
    [updateSettings],
  );

  const commitUiFontFamily = useCallback(
    (value: string) => {
      const sanitized = sanitizeFontFamily(value);
      if (sanitized === null) {
        setUiFontDraft(settings.uiFontFamily);
        return;
      }
      setUiFontDraft(sanitized);
      if (sanitized !== settings.uiFontFamily) {
        void updateSettings({ uiFontFamily: sanitized });
      }
    },
    [settings.uiFontFamily, updateSettings],
  );

  const commitMonoFontFamily = useCallback(
    (value: string) => {
      const sanitized = sanitizeFontFamily(value);
      if (sanitized === null) {
        setMonoFontDraft(settings.monoFontFamily);
        return;
      }
      setMonoFontDraft(sanitized);
      if (sanitized !== settings.monoFontFamily) {
        void updateSettings({ monoFontFamily: sanitized });
      }
    },
    [settings.monoFontFamily, updateSettings],
  );

  const handleUiSizeChange = useCallback((value: string) => {
    setUiSizeDraft(value.replace(/[^\d]/g, ""));
  }, []);

  const handleCodeSizeChange = useCallback((value: string) => {
    setCodeSizeDraft(value.replace(/[^\d]/g, ""));
  }, []);

  const commitUiSize = useCallback(() => {
    const parsed = parseClampedFontSize(uiSizeDraft, {
      min: MIN_UI_FONT_SIZE,
      max: MAX_UI_FONT_SIZE,
    });
    const next = parsed ?? settings.uiFontSize;
    setUiSizeDraft(String(next));
    if (next !== settings.uiFontSize) {
      void updateSettings({ uiFontSize: next });
    }
  }, [settings.uiFontSize, uiSizeDraft, updateSettings]);

  const commitCodeSize = useCallback(() => {
    const parsed = parseClampedFontSize(codeSizeDraft, {
      min: MIN_CODE_FONT_SIZE,
      max: MAX_CODE_FONT_SIZE,
    });
    const next = parsed ?? settings.codeFontSize;
    setCodeSizeDraft(String(next));
    if (next !== settings.codeFontSize) {
      void updateSettings({ codeFontSize: next });
    }
  }, [codeSizeDraft, settings.codeFontSize, updateSettings]);

  const previewBackgroundImageOpacity = useCallback(
    (value: number) => {
      const next = parseBackgroundImageOpacity(value) ?? settings.backgroundImageOpacity;
      setBackgroundImageOpacityPreview(next);
      setRuntimePreviewOpacity(next);
    },
    [setRuntimePreviewOpacity, settings.backgroundImageOpacity],
  );

  const commitBackgroundImageOpacity = useCallback(
    async (value: number) => {
      const next = parseBackgroundImageOpacity(value) ?? settings.backgroundImageOpacity;
      setBackgroundImageOpacityPreview(next);
      try {
        await updateSettings({ backgroundImageOpacity: next });
      } catch (error) {
        setBackgroundImageOpacityPreview(settings.backgroundImageOpacity);
        console.error("[BackgroundImage] Failed to save background opacity", error);
        Alert.alert(
          t("settings.appearance.background.errorTitle"),
          t("settings.appearance.background.saveFailed"),
        );
      } finally {
        setRuntimePreviewOpacity(null);
      }
    },
    [setRuntimePreviewOpacity, settings.backgroundImageOpacity, t, updateSettings],
  );

  useEffect(() => {
    return () => {
      setRuntimePreviewOpacity(null);
    };
  }, [setRuntimePreviewOpacity]);

  const selectBackgroundImage = useCallback(async () => {
    const picked = await pickImage();
    if (!picked) {
      return;
    }

    setIsSavingBackgroundImage(true);
    let nextBackgroundImage: AppSettings["backgroundImage"] = null;
    try {
      nextBackgroundImage = await persistBackgroundImage(picked);
      await updateSettings({ backgroundImage: nextBackgroundImage });
      if (settings.backgroundImage) {
        await deleteBackgroundImage(settings.backgroundImage).catch((error) => {
          console.warn("[BackgroundImage] Failed to delete replaced background image", error);
        });
      }
    } catch (error) {
      if (nextBackgroundImage) {
        await deleteBackgroundImage(nextBackgroundImage).catch((deleteError) => {
          console.warn("[BackgroundImage] Failed to delete unsaved background image", deleteError);
        });
      }
      console.error("[BackgroundImage] Failed to save background image", error);
      Alert.alert(
        t("settings.appearance.background.errorTitle"),
        t("settings.appearance.background.saveFailed"),
      );
    } finally {
      setIsSavingBackgroundImage(false);
    }
  }, [pickImage, settings.backgroundImage, t, updateSettings]);

  const removeBackgroundImage = useCallback(async () => {
    if (!settings.backgroundImage) {
      return;
    }

    const confirmed = await confirmDialog({
      title: t("settings.appearance.background.removeTitle"),
      message: t("settings.appearance.background.removeMessage"),
      confirmLabel: t("settings.appearance.background.remove"),
      cancelLabel: t("common.actions.cancel"),
      destructive: true,
    });
    if (!confirmed) {
      return;
    }

    setIsSavingBackgroundImage(true);
    try {
      await updateSettings({ backgroundImage: null });
      await deleteBackgroundImage(settings.backgroundImage).catch((error) => {
        console.warn("[BackgroundImage] Failed to delete removed background image", error);
      });
    } catch (error) {
      console.error("[BackgroundImage] Failed to remove background image", error);
      Alert.alert(
        t("settings.appearance.background.errorTitle"),
        t("settings.appearance.background.removeFailed"),
      );
    } finally {
      setIsSavingBackgroundImage(false);
    }
  }, [settings.backgroundImage, t, updateSettings]);

  // Live-while-typing: the in-progress drafts drive the preview without
  // committing to the global theme. Empty/invalid fields fall back to the
  // theme value inside the preview.
  const previewOverrides = useMemo(
    () => ({
      monoFontFamily: monoFontDraft,
      codeFontSize: sizeDraftToOverride(codeSizeDraft),
    }),
    [codeSizeDraft, monoFontDraft],
  );

  return (
    <View>
      <SettingsSection title={t("settings.appearance.theme.title")}>
        <View style={settingsStyles.card}>
          <ThemeRow value={settings.theme} onChange={handleThemeChange} />
        </View>
      </SettingsSection>
      <SettingsSection title={t("settings.appearance.detailLevel.title")}>
        <View style={settingsStyles.card}>
          <AutoExpandReasoningRow
            value={settings.autoExpandReasoning}
            onChange={handleAutoExpandReasoningChange}
          />
          <ToolCallDetailRow
            value={settings.toolCallDetailLevel}
            onChange={handleToolCallDetailLevelChange}
          />
        </View>
      </SettingsSection>
      <SettingsSection title={t("settings.appearance.fonts.title")}>
        <View style={settingsStyles.card}>
          {showFontFamilyRows ? (
            <FontFamilyRow
              title={t("settings.appearance.fonts.interfaceFont")}
              hint={t("settings.appearance.fonts.interfaceFontHint")}
              accessibilityLabel={t("settings.appearance.fonts.interfaceFontAccessibility")}
              placeholder={uiFontPlaceholder}
              value={settings.uiFontFamily}
              draft={uiFontDraft}
              withBorder={false}
              onChangeDraft={setUiFontDraft}
              onCommit={commitUiFontFamily}
            />
          ) : null}
          <FontSizeRow
            title={t("settings.appearance.fonts.interfaceSize")}
            accessibilityLabel={t("settings.appearance.fonts.interfaceSizeAccessibility")}
            draft={uiSizeDraft}
            withBorder={showFontFamilyRows}
            onChangeDraft={handleUiSizeChange}
            onCommit={commitUiSize}
          />
          {showFontFamilyRows ? (
            <FontFamilyRow
              title={t("settings.appearance.fonts.codeFont")}
              hint={t("settings.appearance.fonts.codeFontHint")}
              accessibilityLabel={t("settings.appearance.fonts.codeFontAccessibility")}
              placeholder={monoFontPlaceholder}
              value={settings.monoFontFamily}
              draft={monoFontDraft}
              withBorder
              onChangeDraft={setMonoFontDraft}
              onCommit={commitMonoFontFamily}
            />
          ) : null}
          <FontSizeRow
            title={t("settings.appearance.fonts.codeSize")}
            accessibilityLabel={t("settings.appearance.fonts.codeSizeAccessibility")}
            draft={codeSizeDraft}
            onChangeDraft={handleCodeSizeChange}
            onCommit={commitCodeSize}
          />
        </View>
      </SettingsSection>
      <SettingsSection title={t("settings.appearance.syntax.title")}>
        <View style={settingsStyles.card}>
          <SyntaxRow value={settings.syntaxTheme} onChange={handleSyntaxThemeChange} />
        </View>
        <View style={styles.preview}>
          <AppearancePreview overrides={previewOverrides} />
        </View>
      </SettingsSection>
      <SettingsSection title={t("settings.appearance.background.title")}>
        <View style={settingsStyles.card}>
          <BackgroundImageRow
            hasBackgroundImage={settings.backgroundImage !== null}
            isSaving={isSavingBackgroundImage}
            onSelect={selectBackgroundImage}
            onRemove={removeBackgroundImage}
          />
          {settings.backgroundImage ? (
            <BackgroundImageOpacityRow
              value={backgroundImageOpacityPreview}
              onValueChange={previewBackgroundImageOpacity}
              onSlidingComplete={commitBackgroundImageOpacity}
            />
          ) : null}
        </View>
      </SettingsSection>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  preview: {
    marginTop: theme.spacing[4],
  },
  rowWithBorder: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing[4],
    paddingHorizontal: theme.spacing[4],
    borderTopWidth: theme.borderWidth[1],
    borderTopColor: theme.colors.border,
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  triggerPressed: {
    opacity: 0.85,
  },
  triggerText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  swatch: {
    width: ICON_SIZE.md,
    height: ICON_SIZE.md,
    borderRadius: ICON_SIZE.md / 2,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  fontFamilyInput: {
    flexGrow: 1,
    flexShrink: 1,
    maxWidth: 280,
    minHeight: 36,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    textAlign: "left",
  },
  sizeField: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  backgroundActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  opacityControl: {
    width: 260,
    maxWidth: "48%",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
  },
  opacitySlider: {
    flex: 1,
    height: 36,
  },
  opacityValue: {
    width: 44,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },
  sizeInput: {
    width: 64,
    minHeight: 36,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    textAlign: "right",
  },
  unit: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  placeholderColor: {
    color: theme.colors.foregroundMuted,
  },
}));
