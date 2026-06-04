import React, { useState, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/_core/hooks/useAuth';

const VoiceAssistant: React.FC = () => {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [audioFile, setAudioFile] = useState<File | null>(null);
  const [transcribedText, setTranscribedText] = useState<string>('');
  const [textToSynthesize, setTextToSynthesize] = useState<string>('');
  const [synthesizedAudioUrl, setSynthesizedAudioUrl] = useState<string>('');
  const audioRef = useRef<HTMLAudioElement>(null);

  const transcribeMutation = trpc.voice.transcribe.useMutation({
    onSuccess: (data) => {
      setTranscribedText(data.text);
      toast.success('Audio transcribed successfully!');
    },
    onError: (error) => {
      toast.error(`Transcription failed: ${error.message}`);
    },
  });

  const synthesizeMutation = trpc.voice.synthesize.useMutation({
    onSuccess: (data) => {
      setSynthesizedAudioUrl(data.audioUrl);
      toast.success('Text synthesized successfully!');
    },
    onError: (error) => {
      toast.error(`Synthesis failed: ${error.message}`);
    },
  });

  const handleAudioFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      setAudioFile(event.target.files[0]);
    }
  };

  const handleTranscribe = async () => {
    if (!audioFile) {
      toast.error('Please select an audio file to transcribe.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1] || '';
      transcribeMutation.mutate({ audio: base64 });
    };
    reader.readAsDataURL(audioFile);
  };

  const handleSynthesize = async () => {
    if (!textToSynthesize.trim()) {
      toast.error('Please enter text to synthesize.');
      return;
    }
    synthesizeMutation.mutate({ text: textToSynthesize });
  };

  if (authLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="ml-2">Loading authentication...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <Card className="w-[350px] mx-auto mt-10">
        <CardHeader>
          <CardTitle>Access Denied</CardTitle>
          <CardDescription>Please log in to use the Voice Assistant.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={() => toast.info('Redirect to login page or show login modal.')}>Login</Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Voice Assistant</h1>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Audio Transcription</CardTitle>
          <CardDescription>Upload an audio file to convert speech to text.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid w-full items-center gap-4">
            <div className="flex flex-col space-y-1.5">
              <label htmlFor="audio-upload">Upload Audio</label>
              <Input id="audio-upload" type="file" accept="audio/*" onChange={handleAudioFileChange} />
            </div>
            <Button
              onClick={handleTranscribe}
              disabled={transcribeMutation.isLoading || !audioFile}
            >
              {transcribeMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Transcribe Audio
            </Button>
            {transcribedText && (
              <div className="flex flex-col space-y-1.5 mt-4">
                <label>Transcribed Text</label>
                <Textarea value={transcribedText} readOnly rows={5} />
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Text-to-Speech Synthesis</CardTitle>
          <CardDescription>Enter text to convert it into spoken audio.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid w-full items-center gap-4">
            <div className="flex flex-col space-y-1.5">
              <label htmlFor="text-to-synthesize">Text to Synthesize</label>
              <Textarea
                id="text-to-synthesize"
                placeholder="Enter text here..."
                value={textToSynthesize}
                onChange={(e) => setTextToSynthesize(e.target.value)}
                rows={5}
              />
            </div>
            <Button
              onClick={handleSynthesize}
              disabled={synthesizeMutation.isLoading || !textToSynthesize.trim()}
            >
              {synthesizeMutation.isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Synthesize Speech
            </Button>
            {synthesizedAudioUrl && (
              <div className="flex flex-col space-y-1.5 mt-4">
                <label>Synthesized Audio</label>
                <audio ref={audioRef} controls src={synthesizedAudioUrl} className="w-full" />
                <Button onClick={() => audioRef.current?.play()} className="mt-2">Play Audio</Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default VoiceAssistant;
