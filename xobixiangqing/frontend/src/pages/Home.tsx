import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Sparkles, FileText, FileEdit, ImagePlus, Paperclip, Palette, Lightbulb, ShoppingBag, Repeat2 } from 'lucide-react';
import { BulbOutlined } from '@ant-design/icons';
import { Button, Textarea, Card, useToast, MaterialGeneratorModal, ProductReplaceModal, ReferenceFileList, ReferenceFileSelector, FilePreviewModal, ImagePreviewList } from '@/components/shared';
import { TemplateSelector, getTemplateFile } from '@/components/shared/TemplateSelector';
import { listUserTemplates, type UserTemplate, uploadReferenceFile, type ReferenceFile, associateFileToProject, triggerFileParse, uploadMaterial, associateMaterialsToProject, captionMaterials, type Material } from '@/api/endpoints';
import { useProjectStore } from '@/store/useProjectStore';
import { ECOM_PRESET_STYLES } from '@/config/ecomPresetStyles';

type CreationType = 'ecom' | 'idea' | 'outline' | 'description';

export const Home: React.FC = () => {
  const navigate = useNavigate();
  const { initializeProject, isGlobalLoading } = useProjectStore();
  const { show, ToastContainer } = useToast();

  const [activeTab, setActiveTab] = useState<CreationType>('ecom');
  const [content, setContent] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<File | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [selectedPresetTemplateId, setSelectedPresetTemplateId] = useState<string | null>(null);
  const [isMaterialModalOpen, setIsMaterialModalOpen] = useState(false);
  const [isProductReplaceOpen, setIsProductReplaceOpen] = useState(false);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [userTemplates, setUserTemplates] = useState<UserTemplate[]>([]);
  const [referenceFiles, setReferenceFiles] = useState<ReferenceFile[]>([]);
  const [uploadedMaterials, setUploadedMaterials] = useState<Material[]>([]);
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isFileSelectorOpen, setIsFileSelectorOpen] = useState(false);
  const [previewFileId, setPreviewFileId] = useState<string | null>(null);
  const [useTemplateStyle, setUseTemplateStyle] = useState(false);
  const [templateStyle, setTemplateStyle] = useState('');
  const [hoveredPresetId, setHoveredPresetId] = useState<string | null>(null);
  const [ecomPageAspectRatio, setEcomPageAspectRatio] = useState('3:4');
  const [isPreparingEcomPrompt, setIsPreparingEcomPrompt] = useState(false);
  const [isDraggingImage, setIsDraggingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 检查是否有当前项目 & 加载用户模板
  useEffect(() => {
    const projectId = localStorage.getItem('currentProjectId');
    setCurrentProjectId(projectId);

    // 加载用户模板列表（用于按需获取File）
    const loadTemplates = async () => {
      try {
        const response = await listUserTemplates();
        if (response.data?.templates) {
          setUserTemplates(response.data.templates);
        }
      } catch (error) {
        console.error('加载用户模板失败:', error);
      }
    };
    loadTemplates();
  }, []);

  // 电商模式：默认使用“风格描述（无模板）”以匹配平台风格预设
  useEffect(() => {
    setUseTemplateStyle(true);
    setSelectedTemplate(null);
    setSelectedTemplateId(null);
    setSelectedPresetTemplateId(null);
  }, [activeTab]);

  const handleOpenMaterialModal = () => {
    // 在主页始终生成全局素材，不关联任何项目
    setIsMaterialModalOpen(true);
  };

  // 检测粘贴事件，自动上传文件和图片
  const handlePaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    console.log('Paste event triggered');
    const items = e.clipboardData?.items;
    if (!items) {
      console.log('No clipboard items');
      return;
    }

    console.log('Clipboard items:', items.length);

    // 检查是否有文件或图片
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      console.log(`Item ${i}:`, { kind: item.kind, type: item.type });

      if (item.kind === 'file') {
        const file = item.getAsFile();
        console.log('Got file:', file);

        if (file) {
          console.log('File details:', { name: file.name, type: file.type, size: file.size });

          // 检查是否是图片
          if (file.type.startsWith('image/')) {
            console.log('Image detected, uploading...');
            e.preventDefault(); // 阻止默认粘贴行为
            await handleImageUpload(file);
            return;
          }

          // 检查文件类型（参考文件）
          const allowedExtensions = ['pdf', 'docx', 'doc', 'xlsx', 'xls', 'csv', 'txt', 'md'];
          const fileExt = file.name.split('.').pop()?.toLowerCase();

          console.log('File extension:', fileExt);

          if (fileExt && allowedExtensions.includes(fileExt)) {
            console.log('File type allowed, uploading...');
            e.preventDefault(); // 阻止默认粘贴行为
            await handleFileUpload(file);
          } else {
            console.log('File type not allowed');
            show({ message: `不支持的文件类型: ${fileExt}`, type: 'info' });
          }
        }
      }
    }
  };

  // 上传图片
  // 在 Home 页面，图片始终上传为全局素材（不关联项目），因为此时还没有项目
  const handleImageUpload = async (file: File) => {
    if (isUploadingFile) return;

    setIsUploadingFile(true);
    try {
      // 显示上传中提示
      show({ message: '正在上传图片...', type: 'info' });

      // 上传图片到素材库（全局素材）
      const response = await uploadMaterial(file, null);

      const material = response?.data;
      if (material?.url) {
        setUploadedMaterials((prev) => {
          if (prev.some((m) => m.url === material.url)) return prev;
          return [...prev, material];
        });

        show({ message: '图片上传成功！已添加到图片列表', type: 'success' });
      } else {
        show({ message: '图片上传失败：未返回图片信息', type: 'error' });
      }
    } catch (error: any) {
      setIsPreparingEcomPrompt(false);
      console.error('图片上传失败:', error);
      show({
        message: `图片上传失败: ${error?.response?.data?.error?.message || error.message || '未知错误'}`,
        type: 'error'
      });
    } finally {
      setIsUploadingFile(false);
    }
  };

  // 上传文件
  // 在 Home 页面，文件始终上传为全局文件（不关联项目），因为此时还没有项目
  const handleFileUpload = async (file: File) => {
    if (isUploadingFile) return;

    // 检查文件大小（前端预检查）
    const maxSize = 200 * 1024 * 1024; // 200MB
    if (file.size > maxSize) {
      show({
        message: `文件过大：${(file.size / 1024 / 1024).toFixed(1)}MB，最大支持 200MB`,
        type: 'error'
      });
      return;
    }

    setIsUploadingFile(true);
    try {
      // 在 Home 页面，始终上传为全局文件
      const response = await uploadReferenceFile(file, null);
      if (response?.data?.file) {
        const uploadedFile = response.data.file;
        setReferenceFiles(prev => [...prev, uploadedFile]);
        show({ message: '文件上传成功', type: 'success' });

        // 如果文件状态为 pending，自动触发解析
        if (uploadedFile.parse_status === 'pending') {
          try {
            const parseResponse = await triggerFileParse(uploadedFile.id);
            // 使用解析接口返回的文件对象更新状态
            if (parseResponse?.data?.file) {
              const parsedFile = parseResponse.data.file;
              setReferenceFiles(prev =>
                prev.map(f => f.id === uploadedFile.id ? parsedFile : f)
              );
            } else {
              // 如果没有返回文件对象，手动更新状态为 parsing（异步线程会稍后更新）
              setReferenceFiles(prev =>
                prev.map(f => f.id === uploadedFile.id ? { ...f, parse_status: 'parsing' as const } : f)
              );
            }
          } catch (parseError: any) {
            console.error('触发文件解析失败:', parseError);
            // 解析触发失败不影响上传成功提示
          }
        }
      } else {
        show({ message: '文件上传失败：未返回文件信息', type: 'error' });
      }
    } catch (error: any) {
      console.error('文件上传失败:', error);

      // 特殊处理413错误
      if (error?.response?.status === 413) {
        show({
          message: `文件过大：${(file.size / 1024 / 1024).toFixed(1)}MB，最大支持 200MB`,
          type: 'error'
        });
      } else {
        show({
          message: `文件上传失败: ${error?.response?.data?.error?.message || error.message || '未知错误'}`,
          type: 'error'
        });
      }
    } finally {
      setIsUploadingFile(false);
    }
  };

  // 从当前项目移除文件引用（不删除文件本身）
  const handleFileRemove = (fileId: string) => {
    setReferenceFiles(prev => prev.filter(f => f.id !== fileId));
  };

  // 文件状态变化回调
  const handleFileStatusChange = (updatedFile: ReferenceFile) => {
    setReferenceFiles(prev =>
      prev.map(f => f.id === updatedFile.id ? updatedFile : f)
    );
  };

  // 点击回形针按钮 - 打开文件选择器
  const handlePaperclipClick = () => {
    setIsFileSelectorOpen(true);
  };

  // 从选择器选择文件后的回调
  const handleFilesSelected = (selectedFiles: ReferenceFile[]) => {
    // 合并新选择的文件到列表（去重）
    setReferenceFiles(prev => {
      const existingIds = new Set(prev.map(f => f.id));
      const newFiles = selectedFiles.filter(f => !existingIds.has(f.id));
      // 合并时，如果文件已存在，更新其状态（可能解析状态已改变）
      const updated = prev.map(f => {
        const updatedFile = selectedFiles.find(sf => sf.id === f.id);
        return updatedFile || f;
      });
      return [...updated, ...newFiles];
    });
    show({ message: `已添加 ${selectedFiles.length} 个参考文件`, type: 'success' });
  };

  // 获取当前已选择的文件ID列表，传递给选择器（使用 useMemo 避免每次渲染都重新计算）
  const selectedFileIds = useMemo(() => {
    return referenceFiles.map(f => f.id);
  }, [referenceFiles]);

  // 从已上传图片列表中移除图片（同时兼容移除 content 中的 markdown 图片链接）
  const handleRemoveImage = (imageUrl: string) => {
    setUploadedMaterials((prev) => prev.filter((m) => m.url !== imageUrl));
    setContent(prev => {
      // 移除所有匹配该URL的markdown图片链接
      const imageRegex = new RegExp(`!\\[[^\\]]*\\]\\(${imageUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`, 'g');
      let newContent = prev.replace(imageRegex, '');

      // 清理多余的空行（最多保留一个空行）
      newContent = newContent.replace(/\n{3,}/g, '\n\n');

      return newContent.trim();
    });

    show({ message: '已移除图片', type: 'success' });
  };

  // 文件选择变化
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      await handleFileUpload(files[i]);
    }

    // 清空 input，允许重复选择同一文件
    e.target.value = '';
  };

  // 图片选择变化（商品图上传）
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    if (!file.type.startsWith('image/')) {
      show({ message: '请选择图片文件', type: 'error' });
      e.target.value = '';
      return;
    }

    await handleImageUpload(file);
    e.target.value = '';
  };

  const tabConfig = {
    ecom: {
      icon: <ShoppingBag size={20} />,
      label: '电商详情页',
      placeholder: '先上传一张商品图（上方点击/拖拽/粘贴），再补充：商品名、核心卖点、材质/规格、适用场景、目标人群、价格区间等…',
      description: '上传商品图片，一键生成电商详情页多张单图（主图 1:1，其余默认 3:4，可在下方选择）',
    },
    idea: {
      icon: <Sparkles size={20} />,
      label: '纯文本生成',
      placeholder: '例如：冬季女士羽绒服，轻薄保暖，90%白鸭绒，可机洗，适合通勤；目标人群 25-35；主打性价比。',
      description: '不上传图片也可以：仅基于文字生成详情页结构与逐页文案，再批量出图',
    },
    outline: {
      icon: <FileText size={20} />,
      label: '从结构生成',
      placeholder: '粘贴你的详情页结构...\n\n例如：\n1. 封面/主视觉\n- 商品名+一句话卖点\n2. 核心卖点\n- 卖点1/卖点2/卖点3\n3. 细节展示\n- 面料/工艺/做工\n4. 规格参数\n- 尺码/材质/重量\n5. 服务保障\n- 售后/发货/退换\n...',
      description: '已有详情页结构？直接粘贴即可，AI 将自动切分为逐页结构并生成对应文案',
    },
    description: {
      icon: <FileEdit size={20} />,
      label: '从逐页文案生成',
      placeholder: '粘贴你的逐页文案...\n\n例如：\n第 1 张\n标题：轻薄羽绒服\n内容：一穿就暖 · 不臃肿\n\n第 2 张\n标题：90% 白鸭绒\n内容：蓬松回弹 · 保暖锁温\n\n第 3 张\n标题：细节做工\n内容：走线工整 · 拉链顺滑\n...',
      description: '已有完整逐页文案？AI 将自动解析并直接生成多张详情页图片',
    },
  };

  const handleTemplateSelect = async (templateFile: File | null, templateId?: string) => {
    // 总是设置文件（如果提供）
    if (templateFile) {
      setSelectedTemplate(templateFile);
    }

    // 处理模板 ID
    if (templateId) {
      // 判断是用户模板还是预设模板
      // 预设模板 ID 通常是 '1', '2', '3' 等短字符串
      // 用户模板 ID 通常较长（UUID 格式）
      if (templateId.length <= 3 && /^\d+$/.test(templateId)) {
        // 预设模板
        setSelectedPresetTemplateId(templateId);
        setSelectedTemplateId(null);
      } else {
        // 用户模板
        setSelectedTemplateId(templateId);
        setSelectedPresetTemplateId(null);
      }
    } else {
      // 如果没有 templateId，可能是直接上传的文件
      // 清空所有选择状态
      setSelectedTemplateId(null);
      setSelectedPresetTemplateId(null);
    }
  };

  const handleSubmit = async () => {
    if (activeTab !== 'ecom' && !content.trim()) {
      show({ message: '请输入内容', type: 'error' });
      return;
    }

    // 检查是否有正在解析的文件
    const parsingFiles = referenceFiles.filter(f =>
      f.parse_status === 'pending' || f.parse_status === 'parsing'
    );
    if (parsingFiles.length > 0) {
      show({
        message: `还有 ${parsingFiles.length} 个参考文件正在解析中，请等待解析完成`,
        type: 'info'
      });
      return;
    }

    try {
      // 如果有模板ID但没有File，按需加载
      let templateFile = selectedTemplate;
      if (!templateFile && (selectedTemplateId || selectedPresetTemplateId)) {
        const templateId = selectedTemplateId || selectedPresetTemplateId;
        if (templateId) {
          templateFile = await getTemplateFile(templateId, userTemplates);
        }
      }

      // 传递风格描述（只要有内容就传递，不管开关状态）
      const styleDesc = templateStyle.trim() ? templateStyle.trim() : undefined;

      const coverRatio = '1:1';
      const initType = (activeTab === 'ecom' ? 'idea' : activeTab) as 'idea' | 'outline' | 'description';
      let initContent = content;
      const projectOptions: { project_type: 'ecom'; page_aspect_ratio: string; cover_aspect_ratio: string } = {
        project_type: 'ecom',
        page_aspect_ratio: ecomPageAspectRatio,
        cover_aspect_ratio: coverRatio,
      };

      if (activeTab === 'ecom') {
        const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
        const materialUrls: string[] = uploadedMaterials.map((m) => m.url).filter(Boolean);
        let match;
        while ((match = imageRegex.exec(content)) !== null) {
          materialUrls.push(match[2]);
        }

        // 去重
        const uniqueMaterialUrls = Array.from(new Set(materialUrls));
        if (uniqueMaterialUrls.length === 0) {
          show({ message: '请先上传至少一张商品图', type: 'error' });
          return;
        }

        setIsPreparingEcomPrompt(true);

        const cleanedText = content
          .replace(imageRegex, '')
          .replace(/\\n{3,}/g, '\\n\\n')
          .trim();

        let combinedCaption = '';
        if (uniqueMaterialUrls.length > 0) {
          console.log('=== 开始产品图片识别 ===');
          console.log('发送的图片URL:', uniqueMaterialUrls.slice(0, 3));
          try {
             const capResp = await captionMaterials(
               uniqueMaterialUrls.slice(0, 3),
               '请严格按以下格式输出一行（不要多余解释、不要换行）：' +
                 '品类=...；材质=...；外观=...；电子部件=无/有/不确定；可见文字=...' +
                 '。规则：1) 只描述你在图中看见的**实物产品本身**（如鼠标、杯子等）；2) **忽略背景中**的屏幕、显示器、文字、代码、网页内容，绝对不要把背景当成产品；3) 不要推测"LED/充电/续航/智能"等；4) 看不出电子部件时必须写"电子部件=无"；5) 产品名若看不清就不要写。'
             );
             console.log('captionMaterials 响应:', capResp);
             combinedCaption = capResp.data?.combined_caption?.trim() || '';
             const looksLikeHtml = /<!doctype\s+html|<html\b|<head\b|<meta\b|<script\b|<\/html>/i.test(
               combinedCaption
             );
             if (looksLikeHtml) {
               setIsPreparingEcomPrompt(false);
               show({
                 message:
                   '产品图片识别返回了网页源码（疑似 API Base 配置错误）。请到「设置」把 API Base 设为 OpenAI 兼容的 /v1 地址（例如 https://yunwu.ai/v1），然后重试。',
                 type: 'error',
               });
               return;
             }
             console.log('识别结果 combinedCaption:', combinedCaption || '(空)');
           } catch (e) {
             console.error('=== captionMaterials 调用失败! ===');
             console.error('错误详情:', e);
             // 识别失败，阻止继续生成
            setIsPreparingEcomPrompt(false);
            show({ message: '产品图片识别失败，请检查后端服务后重试', type: 'error' });
            return;
          }
          console.log('=== 产品图片识别结束 ===');

          // 如果识别结果为空，阻止生成大纲浪费tokens
          if (!combinedCaption) {
            setIsPreparingEcomPrompt(false);
            show({ message: '未能识别出产品信息，请检查图片是否清晰可见', type: 'error' });
            return;
          }
        }

        const extractProductNameFromText = (text: string): string => {
          const raw = (text || '').trim();
          if (!raw) return '';

          const lines = raw
            .split('\n')
            .map((l) => l.trim())
            .filter(Boolean);
          const firstLine = lines[0] || '';
          const isFirstLineCandidate =
            firstLine &&
            firstLine.length <= 30 &&
            !/[：:]/.test(firstLine) &&
            !/^(用户补充信息|补充信息|说明|需求|要求)\b/i.test(firstLine);
          if (isFirstLineCandidate) return firstLine;

          const patterns: RegExp[] = [
            /(?:产品名|商品名|名称|名字)\s*[：:]\s*([^\n]{1,30})/i,
            /我名字叫\s*([^\n，,。]{1,30})/i,
            /名字叫\s*([^\n，,。]{1,20})/i,
            /我叫\s*([^\n，,。]{1,20})/i,
          ];
          for (const pattern of patterns) {
            const m = raw.match(pattern);
            if (!m) continue;
            let name = (m[1] || '').trim();
            name = name.replace(/^["'“”‘’]+/, '').replace(/["'“”‘’]+$/, '');
            // Stop at common separators / disclaimers.
            name = name.split(/\s+/)[0] || name;
            name = name.split(/不是/)[0] || name;
            name = name.replace(/[。！!，,;；…\s]+$/g, '').trim();
            name = name.replace(/^(叫|是)\s*/g, '').trim();
            name = name.replace(/(不是|非)\s*(LED|led|USB|usb|充电|电池).*$/i, '').trim();
            if (name && name.length <= 30) return name;
          }

          return '';
        };

        const productName = extractProductNameFromText(cleanedText);

        const userSaysNonElectronic =
          /毛绒|布偶|布娃娃|玩偶|公仔|非电子|不带电|不带灯|不发光|不是\s*(led|LED|usb|USB|充电|电池)/i.test(
            cleanedText
          );
        const userSaysElectronic = /电子部件\s*=\s*有|带\s*(led|LED|usb|USB|充电|电池)/i.test(cleanedText);
        const captionSaysNonElectronic = /电子部件\s*=\s*无/i.test(combinedCaption);
        const captionLooksPlush = /毛绒|布偶|布娃娃|玩偶|公仔/i.test(combinedCaption);

        const nonElectronicHint =
          userSaysNonElectronic || (!userSaysElectronic && (captionSaysNonElectronic || captionLooksPlush));

        const normalizeCaptionForNonElectronic = (caption: string): string => {
          const raw = (caption || '').trim();
          if (!raw || !nonElectronicHint) return raw;

          let out = raw.replace(/电子部件\s*=\s*有/gi, '电子部件=无');
          if (!/电子部件\s*=\s*(无|有|不确定)/i.test(out)) {
            out = out ? `${out}；电子部件=无` : '电子部件=无';
          }
          out = out.replace(
            /(?:LED|USB|Type-?C|充电|电池|续航|智能|传感|电机|马达|APP|蓝牙|语音|遥控)/gi,
            ''
          );
          out = out
            .replace(/；\s*；/g, '；')
            .replace(/；{2,}/g, '；')
            .replace(/^；+|；+$/g, '')
            .trim();
          return out;
        };

        const normalizedCaption = normalizeCaptionForNonElectronic(combinedCaption);

        // 构建 idea_prompt - 只包含产品相关信息，不包含 AI 人设（人设在后端 prompt 模板中）
        // 项目标题/需求应该是用户和产品相关的内容
        initContent = [
          productName ? `产品名：${productName}` : '',
          normalizedCaption ? `商品图分析：${normalizedCaption}` : '',
          nonElectronicHint
            ? '硬性约束：非电子类产品，禁止出现 LED/USB/充电/电池/续航/智能传感/电机 等电子卖点。'
            : '',
          cleanedText ? `用户补充信息：${cleanedText}` : '',
          `输出比例：主图 ${coverRatio}；详情页 ${ecomPageAspectRatio}`,
        ]
          .filter(Boolean)
          .join('\n');
      }

      await initializeProject(initType, initContent, templateFile || undefined, styleDesc, projectOptions);
      setIsPreparingEcomPrompt(false);

      // 根据类型跳转到不同页面
      const projectId = localStorage.getItem('currentProjectId');
      if (!projectId) {
        show({ message: '项目创建失败', type: 'error' });
        return;
      }

      // 关联参考文件到项目
      if (referenceFiles.length > 0) {
        console.log(`Associating ${referenceFiles.length} reference files to project ${projectId}:`, referenceFiles);
        try {
          // 批量更新文件的 project_id
          const results = await Promise.all(
            referenceFiles.map(async file => {
              const response = await associateFileToProject(file.id, projectId);
              console.log(`Associated file ${file.id}:`, response);
              return response;
            })
          );
          console.log('Reference files associated successfully:', results);
        } catch (error) {
          console.error('Failed to associate reference files:', error);
          // 不影响主流程，继续执行
        }
      } else {
        console.log('No reference files to associate');
      }

      // 关联图片素材到项目（优先使用已上传图片列表，同时兼容 content 中的 markdown 图片链接）
      const imageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
      const materialUrls: string[] = uploadedMaterials.map((m) => m.url).filter(Boolean);
      let match;
      while ((match = imageRegex.exec(content)) !== null) {
        materialUrls.push(match[2]); // match[2] 是 URL
      }

      const uniqueMaterialUrls = Array.from(new Set(materialUrls));
      if (uniqueMaterialUrls.length > 0) {
        console.log(`Associating ${uniqueMaterialUrls.length} materials to project ${projectId}:`, uniqueMaterialUrls);
        try {
          const response = await associateMaterialsToProject(projectId, uniqueMaterialUrls);
          console.log('Materials associated successfully:', response);
        } catch (error) {
          console.error('Failed to associate materials:', error);
          // 不影响主流程，继续执行
        }
      } else {
        console.log('No materials to associate');
      }

      if (activeTab === 'ecom' || activeTab === 'idea' || activeTab === 'outline') {
        navigate(`/projects/${projectId}/workbench`);
      } else if (activeTab === 'description') {
        // 从描述生成：直接跳到描述生成页（因为已经自动生成了大纲和描述）
        navigate(`/projects/${projectId}/detail`);
      }
    } catch (error: any) {
      setIsPreparingEcomPrompt(false);
      console.error('创建项目失败:', error);
      // 错误已经在 store 中处理并显示
    }
  };

  return (
    <div className="w-full" style={{ paddingTop: 'var(--xobi-toolbar-safe-top)' }}>
      <main className="relative max-w-5xl mx-auto px-3 md:px-4 py-8 md:py-12">
        <div className="flex items-center justify-end gap-2 mb-6">
          <Button
            variant="secondary"
            size="sm"
            icon={<ImagePlus size={16} className="md:w-[18px] md:h-[18px]" />}
            onClick={handleOpenMaterialModal}
          >
            素材生成
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<Repeat2 size={16} className="md:w-[18px] md:h-[18px]" />}
            onClick={() => setIsProductReplaceOpen(true)}
          >
            产品替换
          </Button>
        </div>

        {/* Hero 标题区 */}
        <div className="text-center mb-10 md:mb-16 space-y-4 md:space-y-6">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-dark-secondary/60 backdrop-blur-sm rounded-full border border-white/10 shadow-sm mb-4">
            <span className="text-2xl animate-pulse"><Sparkles size={20} color="#8B5CF6" /></span>
            <span className="text-sm font-medium text-text-secondary">基于 nano banana pro 的原生 AI 电商图片生成器</span>
          </div>

          <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold leading-tight">
            <span className="bg-gradient-cta bg-clip-text text-transparent" style={{
              backgroundSize: '200% auto',
              animation: 'gradient 3s ease infinite',
            }}>
              xobi · 电商图片助手
            </span>
          </h1>

          <p className="text-lg md:text-xl text-text-secondary max-w-2xl mx-auto font-light">
            上传商品图，批量生成平台级详情页多张单图
          </p>

          {/* 特性标签 */}
          <div className="flex flex-wrap items-center justify-center gap-2 md:gap-3 pt-4">
            {[
              { icon: <ShoppingBag size={14} className="text-purple-apple" />, label: '上传商品图生成详情页' },
              { icon: <Palette size={14} className="text-purple-vibrant" />, label: '多平台风格模板' },
              { icon: <FileEdit size={14} className="text-indigo-vibrant" />, label: '自然语言修改' },
              { icon: <Paperclip size={14} className="text-green-500" />, label: '批量导出图片 ZIP' },
            ].map((feature, idx) => (
              <span
                key={idx}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-dark-secondary/70 backdrop-blur-sm rounded-full text-xs md:text-sm text-text-secondary border border-white/10 shadow-sm hover:shadow-glow transition-all hover:scale-105 cursor-default"
              >
                {feature.icon}
                {feature.label}
              </span>
            ))}
          </div>
        </div>

        {/* 创建卡片 */}
        <Card className="p-4 md:p-10 bg-dark-secondary/90 backdrop-blur-xl shadow-2xl border border-white/10 hover:shadow-glow transition-all duration-300">
          {/* 选项卡 */}
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 mb-6 md:mb-8">
            {(Object.keys(tabConfig) as CreationType[]).map((type) => {
              const config = tabConfig[type];
              return (
                <button
                  key={type}
                  onClick={() => setActiveTab(type)}
                  className={`flex-1 flex items-center justify-center gap-1.5 md:gap-2 px-3 md:px-6 py-2.5 md:py-3 rounded-lg font-medium transition-all text-sm md:text-base touch-manipulation ${activeTab === type
                    ? 'bg-gradient-cta text-white shadow-glow'
                    : 'bg-dark-tertiary border border-white/10 text-text-secondary hover:bg-dark-elevated active:bg-dark-hover'
                    }`}
                >
                  <span className="scale-90 md:scale-100">{config.icon}</span>
                  <span className="truncate">{config.label}</span>
                </button>
              );
            })}
          </div>

          {/* 描述 */}
          <div className="relative">
            <p className="text-sm md:text-base mb-4 md:mb-6 leading-relaxed">
              <span className="inline-flex items-center gap-2 text-text-secondary">
                <Lightbulb size={16} className="text-purple-apple flex-shrink-0" />
                <span className="font-semibold">
                  {tabConfig[activeTab].description}
                </span>
              </span>
            </p>
          </div>

          {/* 电商：商品图上传入口 */}
          {activeTab === 'ecom' && (
            <div className="mb-4 md:mb-6">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-white">商品图片</div>
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<ImagePlus size={16} className="md:w-[18px] md:h-[18px]" />}
                  onClick={() => imageInputRef.current?.click()}
                  disabled={isUploadingFile}
                  className="text-xs md:text-sm"
                >
                  上传商品图
                </Button>
              </div>
              <div
                role="button"
                tabIndex={0}
                onClick={() => imageInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') imageInputRef.current?.click();
                }}
                onDragEnter={(e) => {
                  e.preventDefault();
                  setIsDraggingImage(true);
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingImage(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  setIsDraggingImage(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingImage(false);
                  const file = e.dataTransfer.files?.[0];
                  if (file && file.type.startsWith('image/')) {
                    handleImageUpload(file);
                  } else {
                    show({ message: '请拖拽图片文件', type: 'error' });
                  }
                }}
                className={`w-full rounded-lg border-2 border-dashed p-4 md:p-5 transition-colors cursor-pointer ${isDraggingImage
                  ? 'border-purple-vibrant bg-purple-vibrant/10'
                  : 'border-white/20 hover:border-purple-vibrant/50 hover:bg-white/5'
                  }`}
              >
                <div className="flex items-center gap-3 text-sm text-text-secondary">
                  <div className="p-2 rounded-lg bg-dark-tertiary border border-white/10">
                    <ImagePlus size={18} className="text-purple-apple" />
                  </div>
                  <div className="flex-1">
                    <div className="font-medium text-white">点击上传 / 拖拽上传</div>
                    <div className="text-xs text-text-tertiary mt-1">也支持在下方输入框直接粘贴图片（不会写入输入框）</div>
                  </div>
                </div>
              </div>

              {/* 隐藏的图片输入 */}
              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                onChange={handleImageSelect}
                className="hidden"
              />
            </div>
          )}

          {/* 输入区 - 带按钮 */}
          <div className="relative mb-2 group">
            <div className="absolute -inset-0.5 bg-gradient-cta rounded-lg opacity-0 group-hover:opacity-20 blur transition-opacity duration-300"></div>
            <Textarea
              ref={textareaRef}
              placeholder={tabConfig[activeTab].placeholder}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onPaste={handlePaste}
              rows={activeTab === 'idea' ? 4 : 8}
              className="relative pr-20 md:pr-28 pb-12 md:pb-14 text-sm md:text-base border-2 border-white/10 focus:border-purple-vibrant transition-colors duration-200" // 为右下角按钮留空间
            />

            {/* 左下角：参考文件按钮（回形针图标） */}
            <button
              type="button"
              onClick={handlePaperclipClick}
              className="absolute left-2 md:left-3 bottom-2 md:bottom-3 z-10 p-1.5 md:p-2 text-text-tertiary hover:text-white hover:bg-white/10 rounded-lg transition-colors active:scale-95 touch-manipulation"
              title="选择参考文件"
            >
              <Paperclip size={18} className="md:w-5 md:h-5" />
            </button>

            {/* 右下角：开始生成按钮 */}
            <div className="absolute right-2 md:right-3 bottom-2 md:bottom-3 z-10">
              <Button
                size="sm"
                onClick={handleSubmit}
                loading={isGlobalLoading || isPreparingEcomPrompt}
                disabled={
                  isPreparingEcomPrompt ||
                  (activeTab === 'ecom' ? uploadedMaterials.length === 0 : !content.trim()) ||
                  referenceFiles.some(f => f.parse_status === 'pending' || f.parse_status === 'parsing')
                }
                className="shadow-sm text-xs md:text-sm px-3 md:px-4"
              >
                {referenceFiles.some(f => f.parse_status === 'pending' || f.parse_status === 'parsing')
                  ? '解析中...'
                  : '下一步'}
              </Button>
            </div>
          </div>

          {/* 隐藏的文件输入 */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.md"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* 图片预览列表 */}
          <ImagePreviewList
            images={uploadedMaterials.map((m) => ({
              url: m.url,
              alt: m.original_filename || m.name || m.filename || 'image',
            }))}
            content={content}
            onRemoveImage={handleRemoveImage}
            className="mb-4"
          />

          <ReferenceFileList
            files={referenceFiles}
            onFileClick={setPreviewFileId}
            onFileDelete={handleFileRemove}
            onFileStatusChange={handleFileStatusChange}
            deleteMode="remove"
            className="mb-4"
          />

          {/* 模板选择 */}
          <div className="mb-6 md:mb-8 pt-4 border-t border-white/10">
            {activeTab === 'ecom' && (
              <div className="mb-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-semibold text-white">详情页默认比例</div>
                  <div className="text-xs text-text-tertiary">主图默认 1:1</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['3:4', '4:5', '1:1', '9:16', '16:9'].map((ratio) => (
                    <button
                      key={ratio}
                      type="button"
                      onClick={() => setEcomPageAspectRatio(ratio)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full border-2 transition-all duration-200 ${ecomPageAspectRatio === ratio
                        ? 'border-purple-vibrant bg-purple-vibrant/20 text-white'
                        : 'border-white/20 text-text-secondary hover:border-purple-vibrant/50 hover:bg-white/5'
                        }`}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-text-tertiary mt-2">主图默认 1:1；详情页默认使用上面选择的比例（后续可在每页单独修改）。</p>
              </div>
            )}
            <div className="flex items-center justify-between mb-3 md:mb-4">
              <div className="flex items-center gap-2">
                <Palette size={18} className="text-purple-apple flex-shrink-0" />
                <h3 className="text-base md:text-lg font-semibold text-white">
                  选择风格模板
                </h3>
              </div>
              {/* 无模板模式开关 */}
              <label className="flex items-center gap-2 cursor-pointer group">
                <span className="text-sm text-text-secondary group-hover:text-white transition-colors">
                  使用无模板模式
                </span>
                <div className="relative">
                  <input
                    type="checkbox"
                    checked={useTemplateStyle}
                    onChange={(e) => {
                      setUseTemplateStyle(e.target.checked);
                      // 切换到无模板模式时，清空模板选择
                      if (e.target.checked) {
                        setSelectedTemplate(null);
                        setSelectedTemplateId(null);
                        setSelectedPresetTemplateId(null);
                      }
                      // 不再清空风格描述，允许用户保留已输入的内容
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-dark-tertiary peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-purple-vibrant/30 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-vibrant"></div>
                </div>
              </label>
            </div>

            {/* 根据模式显示不同的内容 */}
            {useTemplateStyle ? (
              <div className="space-y-3">
                <Textarea
                  placeholder="描述您想要的详情页风格，例如：淘宝促销风格，橙白配色，模块化卖点标签..."
                  value={templateStyle}
                  onChange={(e) => setTemplateStyle(e.target.value)}
                  rows={3}
                  className="text-sm border-2 border-white/10 focus:border-purple-vibrant transition-colors duration-200"
                />

                {/* 预设风格按钮 */}
                <div className="space-y-2">
                  <p className="text-xs font-medium text-text-secondary">
                    快速选择预设风格：
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ECOM_PRESET_STYLES.map((preset) => (
                      <div key={preset.id} className="relative">
                        <button
                          type="button"
                          onClick={() => setTemplateStyle(preset.description)}
                          onMouseEnter={() => setHoveredPresetId(preset.id)}
                          onMouseLeave={() => setHoveredPresetId(null)}
                          className="px-3 py-1.5 text-xs font-medium rounded-full border-2 border-white/20 text-text-secondary hover:border-purple-vibrant/50 hover:bg-white/5 transition-all duration-200 hover:shadow-sm"
                        >
                          {preset.name}
                        </button>

                        {/* 悬停时显示预览图片 */}
                        {hoveredPresetId === preset.id && preset.previewImage && (
                          <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 z-50 animate-in fade-in slide-in-from-bottom-2 duration-200">
                            <div className="bg-dark-secondary rounded-lg shadow-2xl border-2 border-purple-vibrant p-2.5 w-72">
                              <img
                                src={preset.previewImage}
                                alt={preset.name}
                                className="w-full h-40 object-cover rounded"
                                onError={(e) => {
                                  // 如果图片加载失败，隐藏预览
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                              <p className="text-xs text-text-secondary mt-2 px-1 line-clamp-3">
                                {preset.description}
                              </p>
                            </div>
                            {/* 小三角形指示器 */}
                            <div className="absolute top-full left-1/2 transform -translate-x-1/2 -mt-1">
                              <div className="w-3 h-3 bg-dark-secondary border-r-2 border-b-2 border-purple-vibrant transform rotate-45"></div>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <p className="text-xs text-text-tertiary flex items-center gap-1">
                  <BulbOutlined />
                  <span>提示：点击预设风格快速填充，或自定义描述风格、配色、布局等要求</span>
                </p>
              </div>
            ) : (
              <TemplateSelector
                onSelect={handleTemplateSelect}
                selectedTemplateId={selectedTemplateId}
                selectedPresetTemplateId={selectedPresetTemplateId}
                showUpload={true} // 在主页上传的模板保存到用户模板库
                projectId={currentProjectId}
              />
            )}
          </div>

        </Card>
      </main>
      <ToastContainer />
      {/* 素材生成模态 - 在主页始终生成全局素材 */}
      <MaterialGeneratorModal
        projectId={null}
        isOpen={isMaterialModalOpen}
        onClose={() => setIsMaterialModalOpen(false)}
      />
      <ProductReplaceModal
        isOpen={isProductReplaceOpen}
        onClose={() => setIsProductReplaceOpen(false)}
      />
      {/* 参考文件选择器 */}
      {/* 在 Home 页面，始终查询全局文件，因为此时还没有项目 */}
      <ReferenceFileSelector
        projectId={null}
        isOpen={isFileSelectorOpen}
        onClose={() => setIsFileSelectorOpen(false)}
        onSelect={handleFilesSelected}
        multiple={true}
        initialSelectedIds={selectedFileIds}
      />

      <FilePreviewModal fileId={previewFileId} onClose={() => setPreviewFileId(null)} />
    </div>
  );
};
