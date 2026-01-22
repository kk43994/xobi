"""
Abstract base class for image generation providers
"""
from abc import ABC, abstractmethod
from typing import Optional, List
from PIL import Image


class ImageProvider(ABC):
    """Abstract base class for image generation"""

    @abstractmethod
    def generate_image(
        self,
        prompt: str,
        ref_images: Optional[List[Image.Image]] = None,
        aspect_ratio: str = "16:9",
        resolution: str = "2K",
        *,
        model: Optional[str] = None,
        timeout: Optional[float] = None,
        max_retries: Optional[int] = None,
    ) -> Optional[Image.Image]:
        """
        Generate image from prompt

        Args:
            prompt: The image generation prompt
            ref_images: Optional list of reference images (PIL Image objects)
            aspect_ratio: Image aspect ratio (e.g., "16:9", "1:1", "4:3")
            resolution: Image resolution ("1K", "2K", "4K") - note: OpenAI format only supports 1K
            model: Optional model override for this request
            timeout: Optional request timeout override (seconds)
            max_retries: Optional retry override (provider-specific)

        Returns:
            Generated PIL Image object, or None if failed
        """
        pass

    def inpaint(
        self,
        image: Image.Image,
        mask: Image.Image,
        prompt: str,
        *,
        model: Optional[str] = None,
        resolution: str = "1K",
    ) -> Optional[Image.Image]:
        """
        Inpaint (edit) specific regions of an image based on a mask.

        Args:
            image: The original image to edit
            mask: A mask image where non-transparent/non-black areas indicate regions to edit
            prompt: Description of what to generate in the masked area
            model: Optional model override for this request
            resolution: Image resolution

        Returns:
            Edited PIL Image object, or None if failed

        Note:
            Default implementation uses generate_image with reference images.
            Subclasses can override for native inpainting support.
        """
        # Default implementation: combine image and mask, use generate_image
        # Subclasses with native inpainting support should override this
        combined = self._create_masked_image(image, mask)
        inpaint_prompt = (
            f"Edit only the RED/marked areas of this image. "
            f"In those areas, generate: {prompt}. "
            f"Keep all other areas exactly the same as the original."
        )
        return self.generate_image(
            prompt=inpaint_prompt,
            ref_images=[combined],
            aspect_ratio="1:1",
            resolution=resolution,
            model=model,
        )

    def _create_masked_image(
        self,
        image: Image.Image,
        mask: Image.Image,
    ) -> Image.Image:
        """
        Create a combined image with masked areas highlighted in red.

        Args:
            image: Original image
            mask: Mask image (non-transparent areas will be highlighted)

        Returns:
            Combined image with mask overlay
        """
        # Ensure images are in RGBA mode
        if image.mode != 'RGBA':
            image = image.convert('RGBA')
        if mask.mode != 'RGBA':
            mask = mask.convert('RGBA')

        # Resize mask to match image size if needed
        if mask.size != image.size:
            mask = mask.resize(image.size, Image.Resampling.LANCZOS)

        # Create a red overlay for the masked area
        result = image.copy()
        mask_data = mask.load()
        result_data = result.load()

        width, height = image.size
        for y in range(height):
            for x in range(width):
                mask_pixel = mask_data[x, y]
                # Check if the mask pixel is non-transparent (alpha > 0)
                if len(mask_pixel) >= 4 and mask_pixel[3] > 50:
                    # Blend with semi-transparent red to indicate edit area
                    orig = result_data[x, y]
                    result_data[x, y] = (
                        min(255, int(orig[0] * 0.5 + 255 * 0.5)),  # R
                        int(orig[1] * 0.5),  # G
                        int(orig[2] * 0.5),  # B
                        orig[3] if len(orig) >= 4 else 255  # A
                    )

        return result
