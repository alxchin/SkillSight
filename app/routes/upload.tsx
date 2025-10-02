import { type FormEvent, useState } from 'react'
import Navbar from "~/components/Navbar";
import FileUploader from "~/components/FileUploader";
import { usePuterStore } from "~/lib/puter";
import { useNavigate } from "react-router";
import { convertPdfToImage } from "~/lib/pdf2img";
import { generateUUID } from "~/lib/utils";
import { prepareInstructions } from '~/constants';

const Upload = () => {
    const { auth, isLoading, fs, ai, kv } = usePuterStore();
    const navigate = useNavigate();
    const [isProcessing, setIsProcessing] = useState(false);
    const [statusText, setStatusText] = useState('');
    const [file, setFile] = useState<File | null>(null);

    const handleFileSelect = (file: File | null) => {
        setFile(file)
    }

    const handleAnalyze = async ({
        companyName,
        jobTitle,
        jobDescription,
        file,
    }: {
        companyName: string;
        jobTitle: string;
        jobDescription: string;
        file: File;
    }) => {
        setIsProcessing(true);
        setStatusText('Uploading the resume file...');

        try {
            // Upload PDF
            const uploadedFile = await fs.upload([file]);
            if (!uploadedFile) throw new Error('Failed to upload resume file');
            console.log('Uploaded resume:', uploadedFile);

            setStatusText('Converting PDF to image...');
            const imageFile = await convertPdfToImage(file);
            if (!imageFile.file) throw new Error('Failed to convert PDF to image');
            console.log('Converted image:', imageFile);

            setStatusText('Uploading resume image...');
            const uploadedImage = await fs.upload([imageFile.file]);
            if (!uploadedImage) throw new Error('Failed to upload resume image');
            console.log('Uploaded image:', uploadedImage);

            setStatusText('Preparing data for analysis...');
            const uuid = generateUUID();
            const data = {
                id: uuid,
                resumePath: uploadedFile.path,
                imagePath: uploadedImage.path,
                companyName,
                jobTitle,
                jobDescription,
                feedback: '',
            };

            await kv.set(`resume:${uuid}`, JSON.stringify(data));
            console.log('KV set result:', true);

            setStatusText('Analyzing resume with AI...');
            // Wrap AI call in try/catch
            let feedback;
            try {
                feedback = await ai.feedback(
                    uploadedFile.path,
                    prepareInstructions({ jobTitle, jobDescription })
                );
            } catch (aiError) {
                console.error('AI feedback call failed:', aiError);
                setStatusText('Error: AI analysis failed');
                setIsProcessing(false);
                return;
            }

            if (!feedback) {
                setStatusText('Error: AI did not return any feedback');
                setIsProcessing(false);
                return;
            }

            console.log('AI feedback:', feedback);

            const feedbackText =
                typeof feedback.message.content === 'string'
                    ? feedback.message.content
                    : feedback.message.content[0].text;

            // Parse and save AI feedback
            try {
                data.feedback = JSON.parse(feedbackText);
            } catch (parseError) {
                console.error('Failed to parse AI feedback:', parseError);
                setStatusText('Error: Unable to parse AI feedback');
                setIsProcessing(false);
                return;
            }

            await kv.set(`resume:${uuid}`, JSON.stringify(data));
            setStatusText('Analysis complete, redirecting...');
            console.log('Final data saved:', data);

            // Redirect to resume review page
            navigate(`/resume/${uuid}`);
        } catch (err) {
            console.error('Error in handleAnalyze:', err);
            setStatusText(`Error: ${err instanceof Error ? err.message : String(err)}`);
            setIsProcessing(false);
        }
    };

    const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
        e.preventDefault();
        const form = e.currentTarget.closest('form');
        if (!form) return;
        const formData = new FormData(form);

        const companyName = formData.get('company-name') as string;
        const jobTitle = formData.get('job-title') as string;
        const jobDescription = formData.get('job-description') as string;

        if (!file) return;

        handleAnalyze({ companyName, jobTitle, jobDescription, file });
    }

    return (
        <main className="bg-[url('/images/bg-main.svg')] bg-cover">
            <Navbar />

            <section className="main-section">
                <div className="page-heading py-16">
                    <h1>Smart feedback for your dream job</h1>
                    {isProcessing ? (
                        <>
                            <h2>{statusText}</h2>
                            <img src="/images/resume-scan.gif" className="w-full" />
                        </>
                    ) : (
                        <h2>Drop your resume for an ATS score and improvement tips</h2>
                    )}
                    {!isProcessing && (
                        <form id="upload-form" onSubmit={handleSubmit} className="flex flex-col gap-4 mt-8">
                            <div className="form-div">
                                <label htmlFor="company-name">Company Name</label>
                                <input type="text" name="company-name" placeholder="Company Name" id="company-name" />
                            </div>
                            <div className="form-div">
                                <label htmlFor="job-title">Job Title</label>
                                <input type="text" name="job-title" placeholder="Job Title" id="job-title" />
                            </div>
                            <div className="form-div">
                                <label htmlFor="job-description">Job Description</label>
                                <textarea rows={5} name="job-description" placeholder="Job Description" id="job-description" />
                            </div>

                            <div className="form-div">
                                <label htmlFor="uploader">Upload Resume</label>
                                <FileUploader onFileSelect={handleFileSelect} />
                            </div>

                            <button className="primary-button" type="submit">
                                Analyze Resume
                            </button>
                        </form>
                    )}
                </div>
            </section>
        </main>
    )
}
export default Upload